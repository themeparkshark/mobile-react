/**
 * Tonight's Fin-ister Nights state for the park on the map (DESIGN 3.1, 7).
 *
 * - Fetches GET /parks/{id}/fright and keeps the server clock offset (R5).
 * - Polls every config.poll_seconds (default 120) only while the mode is ON,
 *   the map is focused and the app is open; every 20 minutes while in an event
 *   park otherwise; never elsewhere (frightPollMs).
 * - Recomputes the phase on the server-corrected clock and re-fetches at each
 *   phase edge with timers (R3, R4, R10), and when the phone's wall clock jumps
 *   against the monotonic clock (tamper guard).
 * - Keeps the last event payload after the presence leaves the park, so the
 *   exit moment and the Marquee (F4a) still know the night.
 * - Publishes a snapshot for frightPhotoTheme / isFrightModeOn.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { getFrightTonight, type FrightActionResult, type FrightPhase, type FrightRun, type FrightSide,
  type FrightTonight }
  from '../api/endpoints/fright';
import { artFromAssets, rememberFrightArt } from '../services/fright/art';
import { clockJumped, clockOffset, monoNow, serverNow, type ClockBaseline } from '../services/fright/clock';
import { FRIGHT_DEFAULTS, frightModeName } from '../services/fright/config';
import { effectivePhase, frightPollMs, isModeOn, nextPhaseEdge } from '../services/fright/phase';
import { FRIGHT_OFF, publishFrightSnapshot } from '../services/fright/store';

export interface FrightNight {
  /** Payload for the park on the map (or the last event park after leaving it). */
  readonly tonight: FrightTonight | null;
  readonly phase: FrightPhase;
  readonly modeOn: boolean;
  /** The current park has a Fin-ister event (any phase). */
  readonly eventPark: boolean;
  /** The presence left the event park this session (F4a). */
  readonly leftEventPark: boolean;
  readonly offset: number;
  readonly title: string;
  readonly foreground: boolean;
  /** Increments each time the app comes to the foreground (next-app-open finish, F4c). */
  readonly openCount: number;
  /** Server-corrected now (call it; it is not state). */
  readonly now: () => number;
  readonly refresh: () => Promise<void>;
  /** Merge a write result (run, lantern, side) into the payload without waiting for the next poll. */
  readonly applyResult: (key: string, result: FrightActionResult,
    options?: { readonly patch?: Partial<FrightRun>; readonly found?: boolean; readonly side?: FrightSide | null }) => void;
  readonly setCalm: (calm: boolean) => void;
}

export default function useFrightNight(parkId: number | null, focused: boolean): FrightNight {
  const [tonight, setTonight] = useState<FrightTonight | null>(null);
  const [offset, setOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [openCount, setOpenCount] = useState(1);
  const [leftEventPark, setLeftEventPark] = useState(false);
  const [calm, setCalm] = useState(false);
  const baseline = useRef<ClockBaseline | null>(null);
  const offsetRef = useRef(0);
  const lastFetchAt = useRef<number | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const parkRef = useRef(parkId);
  parkRef.current = parkId;
  const tonightRef = useRef(tonight);
  tonightRef.current = tonight;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const active = state === 'active';
      setForeground(active);
      if (active) setOpenCount(count => count + 1);
    });
    return () => subscription.remove();
  }, []);

  const now = useCallback(() => serverNow(offsetRef.current), []);

  const refresh = useCallback((): Promise<void> => {
    const id = parkRef.current;
    if (id == null) return Promise.resolve();
    if (inflight.current) return inflight.current;
    const promise = getFrightTonight(id).then(result => {
      if (parkRef.current !== id) return;
      lastFetchAt.current = Date.now();
      if (!result) return;
      const nextOffset = clockOffset(result.tonight.server_now, result.sentAt, result.receivedAt);
      if (nextOffset != null) {
        offsetRef.current = nextOffset;
        setOffset(nextOffset);
      }
      baseline.current = { wall: Date.now(), mono: monoNow() };
      rememberFrightArt(artFromAssets(result.tonight.assets?.card));
      setTonight(result.tonight.enabled && result.tonight.event ? result.tonight : null);
      setLeftEventPark(false);
    }).finally(() => { inflight.current = null; });
    inflight.current = promise;
    return promise;
  }, []);

  // Park change: fetch once. Leaving an event park keeps the payload (exit moment, recap).
  useEffect(() => {
    if (parkId == null) {
      if (tonightRef.current) setLeftEventPark(true);
      return;
    }
    if (tonightRef.current && tonightRef.current.event?.park_id !== parkId) setTonight(null);
    void refresh();
  }, [parkId, refresh]);

  const inPark = parkId != null && tonight?.event?.park_id === parkId;
  const phase = useMemo(() => effectivePhase(tonight, serverNow(offset)), [tonight, offset, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const modeOn = inPark && isModeOn({ locationParkId: parkId, tonight, now: serverNow(offset) });

  // Polling.
  const interval = frightPollMs({ modeOn, focused, foreground, eventPark: inPark, pollSeconds: tonight?.config?.poll_seconds },
    FRIGHT_DEFAULTS.offPollMs);
  useEffect(() => {
    if (interval == null || parkId == null) return;
    const last = lastFetchAt.current;
    const first = last == null ? 0 : Math.max(0, last + interval - Date.now());
    let timer: ReturnType<typeof setTimeout>;
    const run = (delay: number) => {
      timer = setTimeout(() => { void refresh().finally(() => run(interval)); }, delay);
    };
    run(first);
    return () => clearTimeout(timer);
  }, [interval, parkId, refresh]);

  // Phase edges: flip exactly on time and re-fetch there (R3, R10).
  useEffect(() => {
    if (!tonight?.night || !foreground) return;
    const edge = nextPhaseEdge(tonight.night, serverNow(offsetRef.current));
    if (edge == null) return;
    const delay = edge - serverNow(offsetRef.current) + 250;
    if (delay <= 0 || delay > 2 ** 31 - 1) return;
    const timer = setTimeout(() => {
      setTick(value => value + 1);
      if (parkRef.current != null) void refresh();
    }, delay);
    return () => clearTimeout(timer);
  }, [tonight, foreground, tick, refresh]);

  // Foreground: re-check the clock (tamper or sleep) and refresh when the mode could change.
  useEffect(() => {
    if (!foreground) return;
    if (clockJumped(baseline.current, Date.now(), monoNow())) void refresh();
    setTick(value => value + 1);
    const timer = setInterval(() => {
      if (clockJumped(baseline.current, Date.now(), monoNow())) void refresh();
    }, 60_000);
    return () => clearInterval(timer);
  }, [foreground, openCount, refresh]);

  const applyResult = useCallback((key: string, result: FrightActionResult,
    options?: { readonly patch?: Partial<FrightRun>; readonly found?: boolean; readonly side?: FrightSide | null }) => {
    const patch = options?.patch;
    if (result.server_now) {
      const server = Date.parse(result.server_now);
      if (Number.isFinite(server)) offsetRef.current = Math.round(server - Date.now());
    }
    setTonight(current => {
      if (!current?.me) return current;
      const me = current.me;
      const incoming = result.run ? { ...result.run, ...patch } : patch ? { ...(me.runs.find(r => r.key === key) ?? me.open_run ?? {}), ...patch, key } as FrightRun : null;
      let runs = me.runs;
      let openRun = me.open_run;
      let hauntsTonight = me.haunts_tonight;
      if (incoming) {
        const before = runs.find(r => r.key === key);
        runs = [...runs.filter(r => r.key !== key), incoming];
        if (incoming.done_at) {
          if (openRun?.key === key) openRun = null;
          if (!before?.done_at) hauntsTonight += 1;
        } else if (incoming.entered_at) {
          openRun = incoming;
        }
      }
      const found = options?.found && !me.found_tonight.includes(key) ? [...me.found_tonight, key] : me.found_tonight;
      return {
        ...current,
        me: { ...me, runs, open_run: openRun, haunts_tonight: hauntsTonight, found_tonight: found,
          lantern: result.lantern ?? me.lantern, side: options?.side ?? me.side },
        encounter: options?.found && current.encounter?.key === key ? { ...current.encounter, caught: true } : current.encounter,
      };
    });
  }, []);

  const title = frightModeName(tonight?.event);

  useEffect(() => {
    publishFrightSnapshot(modeOn && tonight?.event ? {
      modeOn, phase, parkId, eventSlug: tonight.event.slug, nightOn: tonight.night?.night_on ?? null,
      nightIndex: tonight.event.night_index, calm, title,
      encountersEnabled: tonight.config?.encounters_enabled === true,
    } : { ...FRIGHT_OFF, calm });
  }, [modeOn, phase, parkId, tonight, calm, title]);
  useEffect(() => () => publishFrightSnapshot(FRIGHT_OFF), []);

  return {
    tonight, phase, modeOn, eventPark: inPark, leftEventPark, offset, title, foreground, openCount, now, refresh,
    applyResult, setCalm,
  };
}
