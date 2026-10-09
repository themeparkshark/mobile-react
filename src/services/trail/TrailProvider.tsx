import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';
import getFeatureFlags from '../../api/endpoints/platform/feature-flags';
import { frontTrailBox, getTrail, openTrailBox, postTrailWalk, putTrailSettings } from '../../api/endpoints/me/trail';
import { AuthContext } from '../../context/AuthProvider';
import { LocationContext, LocationStatusContext } from '../../context/LocationProvider';
import { hydrateTrailSeen } from './trailSeen';
import { createTrailFlag } from './trailFlag';
import { TrailRecorder, type TrailAway, type TrailSegment, type TrailState } from './trailModel';

/**
 * Trail Boxes runtime: records walking windows from the location stream the
 * map already has (no extra GPS, no timers), fills each window's steps from
 * the phone's step history (expo-sensors Pedometer, already in the binary),
 * uploads them in small batches and holds the server's answer.
 *
 * Off unless the server flag `trail_boxes` is on (or a dev preview forces it).
 * Every failure is quiet: walking is a bonus, never a blocker. It never touches
 * queue play.
 */
export type MotionAccess = 'unknown' | 'granted' | 'ask' | 'denied' | 'unavailable';

export interface TrailContextType {
  readonly enabled: boolean;
  readonly state: TrailState | null;
  readonly parkId: number | null;
  readonly syncing: boolean;
  /** Bumps each time the server answers a walk upload (drives fill animations). */
  readonly syncVersion: number;
  readonly motion: MotionAccess;
  readonly refresh: () => Promise<void>;
  /** Close the live window and upload now (sheet opened). */
  readonly flush: () => Promise<void>;
  readonly open: (boxId: number) => Promise<TrailState | null>;
  readonly front: (boxId: number) => Promise<void>;
  readonly setGoal: (steps: number | null) => Promise<void>;
  readonly setWheels: (on: boolean) => Promise<void>;
  readonly askMotion: () => Promise<MotionAccess>;
}

const noop = async () => undefined;
export const TrailContext = createContext<TrailContextType>({
  enabled: false, state: null, parkId: null, syncing: false, syncVersion: 0, motion: 'unknown',
  refresh: noop, flush: noop, open: async () => null, front: noop, setGoal: noop, setWheels: noop, askMotion: async () => 'unknown',
});

export const useTrail = () => useContext(TrailContext);

const PENDING_KEY = 'trail.pending.v1';
const AWAY_KEY = 'trail.away.v1';
const MAX_PENDING = 40;

const trailFlag = (__DEV__ && process.env.EXPO_PUBLIC_TRAIL_FORCE === '1')
  ? async () => true
  : createTrailFlag(async () => (await getFeatureFlags()).flags.trail_boxes === true);

function pedometer(): any | null {
  try { return require('expo-sensors').Pedometer; } catch { return null; }
}

async function readMotion(): Promise<MotionAccess> {
  if (Platform.OS !== 'ios') return 'unavailable';
  const P = pedometer();
  try {
    if (!P || !(await P.isAvailableAsync())) return 'unavailable';
    const p = await P.getPermissionsAsync();
    if (p.granted) return 'granted';
    return p.canAskAgain ? 'ask' : 'denied';
  } catch {
    return 'unavailable';
  }
}

/** The phone's own step count for a window, or null (no permission, no sensor, Android). */
async function stepsFor(seg: TrailSegment): Promise<number | null> {
  if (Platform.OS !== 'ios') return null;
  const P = pedometer();
  try {
    if (!P || !(await P.getPermissionsAsync()).granted) return null;
    const res = await P.getStepCountAsync(new Date(seg.started_at), new Date(seg.ended_at));
    const total = Math.max(0, Math.round(res.steps));
    // App closed a long time: hourly buckets, so the server credits the steps really taken in the part
    // it counts (the walk out of the park), not an average over a hotel evening.
    if (seg.source !== 'live' && seg.ended_at - seg.started_at > 30 * 60_000) {
      try {
        const buckets: number[] = [];
        for (let t = seg.started_at; t < seg.ended_at && buckets.length < 24; t += 3_600_000) {
          const r = await P.getStepCountAsync(new Date(t), new Date(Math.min(seg.ended_at, t + 3_600_000)));
          buckets.push(Math.max(0, Math.round(r.steps)));
        }
        seg.steps_by_hour = buckets;
      } catch {
        // Buckets are a bonus: the total still counts (as a time share).
      }
    }
    return total;
  } catch {
    return null;
  }
}

export function TrailProvider({ children }: { readonly children: ReactNode }) {
  const { player } = useContext(AuthContext);
  const { location } = useContext(LocationContext);
  const { park } = useContext(LocationStatusContext);
  const [flag, setFlag] = useState(false);
  const [state, setState] = useState<TrailState | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncVersion, setSyncVersion] = useState(0);
  const [motion, setMotion] = useState<MotionAccess>('unknown');
  const recorder = useRef(new TrailRecorder());
  const awaySaved = useRef(false);
  const pending = useRef<TrailSegment[]>([]);
  const uploading = useRef(false);
  const parkId = park?.id ?? null;
  const parkRef = useRef(parkId);
  parkRef.current = parkId;
  const enabled = flag && !!player?.id;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => { let on = true; void trailFlag().then(v => { if (on && v !== null) setFlag(v); }); return () => { on = false; }; }, [player?.id]);
  useEffect(() => { if (enabled) { void readMotion().then(setMotion); void hydrateTrailSeen(); } }, [enabled]);

  // Restore what a killed app left behind: windows not yet sent, and where it went to sleep.
  useEffect(() => {
    if (!enabled) return;
    void (async () => {
      try {
        const [p, a] = await Promise.all([AsyncStorage.getItem(PENDING_KEY), AsyncStorage.getItem(AWAY_KEY)]);
        if (p) pending.current = [...(JSON.parse(p) as TrailSegment[]), ...pending.current].slice(-MAX_PENDING);
        if (a && !recorder.current.away) { recorder.current.away = JSON.parse(a) as TrailAway; awaySaved.current = true; }
      } catch { /* nothing saved */ }
    })();
  }, [enabled]);

  const persist = useCallback(() => {
    void AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending.current.slice(-MAX_PENDING))).catch(() => undefined);
  }, []);

  const backoff = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upload = useCallback(async () => {
    if (!enabledRef.current || uploading.current || pending.current.length === 0) return;
    uploading.current = true;
    setSyncing(true);
    let retryIn = 0;
    try {
      const batch = pending.current.slice(0, 20);
      for (const seg of batch) if (seg.steps == null) seg.steps = await stepsFor(seg);
      const next = await postTrailWalk(parkRef.current, batch);
      pending.current = pending.current.filter(s => !batch.includes(s));
      backoff.current = 0;
      persist();
      setState(next);
      setSyncVersion(v => v + 1);
      if (pending.current.length > 0) retryIn = 1500;
    } catch (error: any) {
      const status: number | undefined = error?.response?.status;
      if (status === 404) {
        // The feature is off on this server: stop and forget.
        pending.current = [];
        persist();
        setFlag(false);
      } else if (status === 400 || status === 422) {
        // The server will never take this batch; keep everything after it.
        pending.current = pending.current.slice(20);
        persist();
      } else {
        // No signal, 401/403 (signing back in), 429 or 5xx: keep the walk and try later.
        const header = Number(error?.response?.headers?.['retry-after']);
        backoff.current = Math.min(5 * 60_000, Math.max(5_000, backoff.current * 2 || 5_000));
        retryIn = Number.isFinite(header) && header > 0 ? header * 1000 : backoff.current;
      }
    } finally {
      uploading.current = false;
      setSyncing(false);
    }
    if (retryIn > 0) {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => { retryTimer.current = null; void upload(); }, retryIn);
    }
  }, [persist]);
  useEffect(() => () => { if (retryTimer.current) clearTimeout(retryTimer.current); }, []);

  const take = useCallback((segments: TrailSegment[]) => {
    if (!segments.length) return;
    pending.current = [...pending.current, ...segments].slice(-MAX_PENDING);
    persist();
    // While backing off (no signal), the retry timer sends it; never one POST per window offline.
    if (!retryTimer.current) void upload();
  }, [persist, upload]);

  // Every published fix the map already gets (no extra GPS).
  const onFix = useCallback((lat: number, lng: number) => {
    take(recorder.current.fix(parkRef.current, { lat, lng }, Date.now()));
    if (!recorder.current.away && awaySaved.current) {
      awaySaved.current = false;
      void AsyncStorage.removeItem(AWAY_KEY).catch(() => undefined);
    }
  }, [take]);
  useEffect(() => {
    if (!enabled || !location) return;
    onFix(location.latitude, location.longitude);
  }, [enabled, location?.latitude, location?.longitude, parkId, onFix]);

  const refresh = useCallback(async () => {
    if (!enabledRef.current) return;
    try {
      setState(await getTrail(parkRef.current));
    } catch (error: any) {
      if (error?.response?.status === 404) setFlag(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const sub = AppState.addEventListener('change', s => {
      if (s === 'background') {
        take(recorder.current.background(Date.now()));
        const away = recorder.current.away;
        if (away) {
          awaySaved.current = true;
          void AsyncStorage.setItem(AWAY_KEY, JSON.stringify(away)).catch(() => undefined);
        }
      } else if (s === 'active') {
        void readMotion().then(setMotion);
        void trailFlag().then(v => { if (v !== null) setFlag(v); });
        // A FRESH fix decides where the closed window ends (in the park, or "left"); never the
        // pre-background spot. The phone's last known fix counts only if it is newer than when we
        // went to sleep, so the walk lands at once instead of waiting for the next GPS update.
        const since = recorder.current.away?.at ?? 0;
        void (async () => {
          try {
            const Location = require('expo-location');
            const last = await Location.getLastKnownPositionAsync({ maxAge: 120_000 });
            // Only a sharp fix (<= 50 m): a vague one could call an in-park walk a "left" walk.
            const acc = last?.coords?.accuracy;
            if (last && since && last.timestamp > since && typeof acc === 'number' && acc > 0 && acc <= 50) onFix(last.coords.latitude, last.coords.longitude);
          } catch { /* the next fix does it */ }
          void refresh();
        })();
      }
    });
    return () => sub.remove();
  }, [enabled, take, onFix]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => { if (enabled) void refresh(); }, [enabled, parkId, refresh]);

  const flush = useCallback(async () => {
    take(recorder.current.flush(Date.now()));
    if (pending.current.length === 0) await refresh();
  }, [take, refresh]);

  const open = useCallback(async (boxId: number) => {
    const next = await openTrailBox(boxId, `${boxId}-${player?.id ?? 0}-open`, parkRef.current);
    setState(next);
    return next;
  }, [player?.id]);

  const front = useCallback(async (boxId: number) => { setState(await frontTrailBox(boxId, parkRef.current)); }, []);
  const setGoal = useCallback(async (steps: number | null) => { setState(await putTrailSettings({ weekly_goal_steps: steps }, parkRef.current)); }, []);
  const setWheels = useCallback(async (on: boolean) => { setState(await putTrailSettings({ wheels: on }, parkRef.current)); }, []);
  const askMotion = useCallback(async () => {
    const P = pedometer();
    try { if (P) await P.requestPermissionsAsync(); } catch { /* stays as is */ }
    const now = await readMotion();
    setMotion(now);
    if (now === 'granted') void flush();
    return now;
  }, [flush]);

  const value = useMemo<TrailContextType>(() => ({
    enabled, state, parkId, syncing, syncVersion, motion, refresh, flush, open, front, setGoal, setWheels, askMotion,
  }), [enabled, state, parkId, syncing, syncVersion, motion, refresh, flush, open, front, setGoal, setWheels, askMotion]);

  return <TrailContext.Provider value={value}>{children}</TrailContext.Provider>;
}
