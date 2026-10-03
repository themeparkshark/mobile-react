/**
 * The in-park Fin-ister Nights engine: haunt runs (H1 to H6), reef finds (F1),
 * the offline queue, Rank the Haunt, the Marquee offer (F4), the activation
 * tutorial and coach marks. All rules are pure modules in services/fright; this
 * hook only wires them to GPS, the API, AsyncStorage and UI state.
 *
 * Phones-down (H6): between entry and min_done_at nothing here prompts, plays
 * sound or buzzes. Coach marks, the rank card and toasts wait.
 */
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import {
  enterFrightSpot, findFrightSpot, getFrightCards, finishFrightSpot, markFrightRecapSeen, markFrightSeen, scoreFrightSpot,
  type FrightActionResult, type FrightCaseFileDrop, type FrightReaction, type FrightRun, type FrightSpot,
} from '../../api/endpoints/fright';
import type { FrightNight } from '../../hooks/useFrightNight';
import { artFromAssets, artFromCard, frightArt, rememberFrightArt, type FrightArtSet } from '../../services/fright/art';
import { COPY } from '../../services/fright/copy';
import { encounterLive, reefStep, toWireFix, type ReefHold } from '../../services/fright/finds';
import type { FrightFixSample } from '../../services/fright/geo';
import { isOnPhase } from '../../services/fright/phase';
import {
  dueActions, enqueue, parseQueue, pruneQueue, settle, type QueuedAction,
} from '../../services/fright/queue';
import { nightRecordFrom, parseNightRecord, recapTrigger, type NightRecord } from '../../services/fright/recap';
import { canEnter, exitStep, finishDecision, localRun, minDoneAt, runStage, type ExitHold, type FinishMethod } from '../../services/fright/run';
import { FRIGHT_KEYS, readJson, readKey, writeJson, writeKey } from '../../services/fright/storage';
import {
  coachDismiss, coachEnqueue, coachTick, coachWaitMs, EMPTY_COACH, introPlan, isChaosHour, markSeenLocal, mergeSeen,
  parseSeenStore, type CoachState, type FrightCoachKey, type FrightSeenKey, type IntroPlan, type SeenStore,
} from '../../services/fright/tutorial';

type Sample = { latitude: number; longitude: number; timestamp: number; accuracyMeters?: number | null } | null;

export interface RankPrompt {
  readonly key: string;
  readonly name: string;
  readonly reSwim: boolean;
  /** The player's last score for this haunt (re-swim card asks "Still a four?"). */
  readonly lastScore: number | null;
}

export interface FrightEngine {
  readonly spooky: boolean;
  readonly setSpooky: (on: boolean) => void;
  readonly ambient: boolean;
  readonly setAmbient: (on: boolean) => void;
  readonly sheetOpen: boolean;
  readonly setSheetOpen: (open: boolean) => void;
  /** The haunt the sheet should scroll to and highlight (map tap). */
  readonly focusKey: string | null;
  readonly openSheetAt: (key: string) => void;
  /** Window y of the Fin-ister pill's bottom edge (coach marks and toasts sit below it). */
  readonly pillBottom: number | null;
  readonly setPillBottom: (y: number | null) => void;
  /** One qualifying exit fix is held; a second 60 s later confirms the exit. */
  readonly exitPending: boolean;
  /** The open haunt run (server or optimistic local). */
  readonly openRun: FrightRun | null;
  readonly openSpot: FrightSpot | null;
  /** Phones-down: inside the quiet window of an open run. */
  readonly quiet: boolean;
  readonly canSurvive: boolean;
  readonly busyKey: string | null;
  readonly pendingSync: number;
  readonly enter: (spot: FrightSpot) => Promise<void>;
  readonly survived: () => Promise<void>;
  readonly enterCheck: (spot: FrightSpot) => ReturnType<typeof canEnter>;
  readonly rank: RankPrompt | null;
  readonly submitRank: (score: number, reaction: FrightReaction | null) => Promise<{ fanRank: number | null; myRank: number | null } | null>;
  readonly closeRank: () => void;
  readonly caseFile: FrightCaseFileDrop | null;
  readonly closeCaseFile: () => void;
  readonly toast: string | null;
  readonly clearToast: () => void;
  readonly tutorial: IntroPlan | 'replay';
  readonly finishTutorial: () => void;
  readonly replayTutorial: () => void;
  readonly coach: FrightCoachKey | null;
  readonly dismissCoach: () => void;
  /** The exit moment / Marquee offer (F4). */
  readonly recapOffer: { slug: string; nightOn: string } | null;
  readonly dismissRecapOffer: () => void;
  readonly marquee: { slug: string; nightOn: string } | null;
  readonly openMarquee: (slug: string, nightOn: string) => void;
  readonly closeMarquee: () => void;
  readonly doneKeys: readonly string[];
  /** Server card art learned so far (URLs may be null: draw fallbacks). */
  readonly art: FrightArtSet;
  readonly myRankOf: (key: string) => number | null;
}

function sampleToFix(sample: Sample, offset: number): FrightFixSample | null {
  if (!sample) return null;
  return {
    latitude: sample.latitude, longitude: sample.longitude,
    accuracy: sample.accuracyMeters ?? null, at: sample.timestamp + offset,
  };
}

const ERROR_COPY: Partial<Record<string, string>> = {
  too_far: COPY.tooFar, poor_accuracy: COPY.poorFix, stale_fix: COPY.poorFix, no_fix: COPY.poorFix,
  not_accepting: COPY.closed, not_open: 'Fin-ister Nights isn\'t on yet.', not_in_park: 'You need to be in the park.',
  too_soon: 'Almost! Finish the haunt first.', throttled: 'Easy, Fin-vestigator. Try again in a minute.',
};

export default function useFrightEngine(night: FrightNight, opts: {
  readonly parkId: number | null;
  readonly focused: boolean;
  /** Any GPS change (re-runs the steps). */
  readonly location: { latitude: number; longitude: number } | undefined;
  readonly sampleRef: MutableRefObject<Sample>;
  /** Another first-run flow (the app tutorial, the home intro) owns the screen: hold the Fin-ister intro and coach marks. */
  readonly blocked?: boolean;
}): FrightEngine {
  const { tonight, modeOn, offset, phase, foreground, openCount, applyResult, setCalm, refresh } = night;
  const { focused, location, sampleRef } = opts;
  const event = tonight?.event ?? null;
  const nightOn = tonight?.night?.night_on ?? null;
  const me = tonight?.me ?? null;

  const [loaded, setLoaded] = useState(false);
  const [spooky, setSpookyState] = useState(true);
  const [sheetOpen, setSheetOpenState] = useState(false);
  const [focusKey, setFocusKey] = useState<string | null>(null);
  const [ambient, setAmbientState] = useState<boolean | null>(null);
  const [pillBottom, setPillBottom] = useState<number | null>(null);
  const lastScores = useRef<Record<string, number>>({});
  const setSheetOpen = useCallback((open: boolean) => {
    setSheetOpenState(open);
    if (!open) setFocusKey(null);
  }, []);
  /** Open the haunt sheet scrolled to one haunt (map facade tap). */
  const openSheetAt = useCallback((key: string) => {
    setFocusKey(key);
    setSheetOpenState(true);
  }, []);
  const [queue, setQueue] = useState<QueuedAction[]>([]);
  const [local, setLocal] = useState<{ nightOn: string; run: FrightRun } | null>(null);
  const [record, setRecord] = useState<NightRecord | null>(null);
  const [seenStore, setSeenStore] = useState<SeenStore | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rank, setRank] = useState<RankPrompt | null>(null);
  const [caseFile, setCaseFile] = useState<FrightCaseFileDrop | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [tutorial, setTutorial] = useState<IntroPlan | 'replay'>(null);
  const [coach, setCoach] = useState<CoachState>(EMPTY_COACH);
  const [recapOffer, setRecapOffer] = useState<{ slug: string; nightOn: string } | null>(null);
  const [marquee, setMarquee] = useState<{ slug: string; nightOn: string } | null>(null);
  const [tick, setTick] = useState(0);
  const [art, setArt] = useState<FrightArtSet>(frightArt);
  const reefHold = useRef<ReefHold | null>(null);
  const finishing = useRef(false);
  const exitHold = useRef<ExitHold | null>(null);
  const [exitPending, setExitPending] = useState(false);

  const now = night.now;
  const fix = useCallback(() => sampleToFix(sampleRef.current, offset), [sampleRef, offset]);
  /**
   * The watcher has a distance filter, so a player standing still in a queue
   * or a reef gets no new samples. Ask the OS for one when the last is stale.
   */
  const freshFix = useCallback(async (maxAgeMs = 15_000): Promise<FrightFixSample | null> => {
    const last = fix();
    if (last && now() - last.at <= maxAgeMs && last.accuracy != null && last.accuracy <= 50) return last;
    try {
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 12_000)),
      ]);
      if (!position) return last;
      return { latitude: position.coords.latitude, longitude: position.coords.longitude,
        accuracy: position.coords.accuracy ?? null, at: position.timestamp + offset };
    } catch {
      return last;
    }
  }, [fix, now, offset]);

  // Load persisted state once.
  useEffect(() => {
    let current = true;
    void Promise.all([readKey(FRIGHT_KEYS.queue), readKey(FRIGHT_KEYS.night), readKey(FRIGHT_KEYS.seen),
      readKey(FRIGHT_KEYS.spooky), readJson<{ nightOn: string; run: FrightRun }>(FRIGHT_KEYS.run), readKey(FRIGHT_KEYS.ambient)])
      .then(([q, n, s, sp, run, amb]) => {
        if (amb === '1' || amb === '0') setAmbientState(amb === '1');
        if (!current) return;
        setQueue(parseQueue(q));
        setRecord(parseNightRecord(n));
        setSeenStore(parseSeenStore(s));
        setSpookyState(sp !== '0');
        setCalm(sp === '0');
        setLocal(run && typeof run.nightOn === 'string' && run.run?.key ? run : null);
        setLoaded(true);
      });
    return () => { current = false; };
  }, [setCalm]);

  const persistQueue = useCallback((next: QueuedAction[]) => {
    setQueue(next);
    void writeKey(FRIGHT_KEYS.queue, JSON.stringify(next));
  }, []);
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const setLocalRun = useCallback((next: { nightOn: string; run: FrightRun } | null) => {
    setLocal(next);
    void writeJson(FRIGHT_KEYS.run, next);
  }, []);

  /** Looping ambience is opt-in (battery): default from config.ambience_default, else off. */
  const ambientOn = ambient ?? (tonight?.config?.ambience_default === true);
  const setAmbient = useCallback((on: boolean) => {
    setAmbientState(on);
    void writeKey(FRIGHT_KEYS.ambient, on ? '1' : '0');
  }, []);

  const setSpooky = useCallback((on: boolean) => {
    setSpookyState(on);
    setCalm(!on);
    void writeKey(FRIGHT_KEYS.spooky, on ? '1' : '0');
  }, [setCalm]);

  const spots = useMemo(() => tonight?.spots ?? [], [tonight]);
  const spotByKey = useMemo(() => new Map(spots.map(spot => [spot.key, spot])), [spots]);

  // The open run: the server's, else tonight's optimistic local run.
  const serverOpen = me?.open_run ?? null;
  const localOpen = local && local.nightOn === nightOn && !me?.runs.some(run => run.key === local.run.key && run.done_at)
    ? local.run : null;
  const openRun = serverOpen ?? localOpen;
  const openSpot = openRun ? spotByKey.get(openRun.key) ?? null : null;
  const stage = runStage(openRun, now(), openSpot?.walk_minutes);
  const quiet = stage === 'quiet';
  void tick;

  // Drop the local run once the server knows it (or it expired).
  useEffect(() => {
    if (!local) return;
    if (nightOn && local.nightOn !== nightOn) setLocalRun(null);
    else if (serverOpen?.key === local.run.key || stage === 'expired') setLocalRun(null);
  }, [local, nightOn, serverOpen, stage, setLocalRun]);

  // Flip quiet -> ready exactly at min_done_at.
  useEffect(() => {
    if (stage !== 'quiet' || !openRun) return;
    const min = minDoneAt(openRun, openSpot?.walk_minutes);
    if (min == null) return;
    const timer = setTimeout(() => setTick(value => value + 1), Math.max(0, min - now()) + 200);
    return () => clearTimeout(timer);
  }, [stage, openRun, openSpot, now]);

  const seen = useMemo(() => event ? mergeSeen(event.slug, me?.seen ?? null, seenStore) : {}, [event, me?.seen, seenStore]);
  const markSeen = useCallback((key: FrightSeenKey) => {
    if (!event) return;
    const at = new Date(now()).toISOString();
    setSeenStore(current => {
      const next = markSeenLocal(current, event.slug, key, at);
      void writeKey(FRIGHT_KEYS.seen, JSON.stringify(next));
      return next;
    });
    void markFrightSeen(event.slug, key);
  }, [event, now]);

  const enqueueCoach = useCallback((key: FrightCoachKey) => setCoach(state => coachEnqueue(state, key, seen)), [seen]);

  // Card art: tonight's assets, plus the event pin (chip) from the player's cards, fetched once per event.
  const artFetched = useRef<string | null>(null);
  useEffect(() => {
    if (!tonight) return;
    setArt(rememberFrightArt(artFromAssets(tonight.assets?.card)));
    const slug = tonight.event?.slug;
    if (!modeOn || !slug || artFetched.current === slug) return;
    artFetched.current = slug;
    void getFrightCards().then(result => {
      const card = result?.cards.find(item => item.event_slug === slug);
      if (card) setArt(rememberFrightArt(artFromCard(card.art)));
    });
  }, [tonight, modeOn]);

  /* ---------- Writes ---------- */

  const sendAction = useCallback(async (action: QueuedAction): Promise<FrightActionResult> => {
    if (action.kind === 'enter' && action.fix) return enterFrightSpot(action.key, action.fix);
    if (action.kind === 'done') return finishFrightSpot(action.key, { at: new Date(action.at).toISOString(), method: 'open' });
    return findFrightSpot(action.key, action.fixes ?? [], action.side ?? null);
  }, []);

  const afterFinish = useCallback((key: string, result: FrightActionResult) => {
    const spot = spotByKey.get(key);
    applyResult(key, result);
    setLocalRun(null);
    const lastScore = result.run?.score ?? me?.runs.find(run => run.key === key)?.score ?? lastScores.current[key] ?? null;
    setRank({ key, name: spot?.name ?? 'that haunt', reSwim: !!result.run?.re_swim, lastScore });
    enqueueCoach('rank_first');
  }, [spotByKey, applyResult, setLocalRun, enqueueCoach, me?.runs]);

  const afterFound = useCallback((key: string, result: FrightActionResult) => {
    applyResult(key, result, { found: true, side: null });
    if (result.case_file) {
      setCaseFile(result.case_file);
      enqueueCoach('case_file_first');
    }
  }, [applyResult, enqueueCoach]);

  const enter = useCallback(async (spot: FrightSpot) => {
    if (!nightOn || busyKey) return;
    setBusyKey(spot.key);
    const sample = await freshFix();
    const check = canEnter(spot, sample, now(), { enterAccuracyM: tonight?.config?.enter_accuracy_m });
    if (!check.ok || !sample) {
      setBusyKey(null);
      setToast(ERROR_COPY[check.reason ?? ''] ?? COPY.poorFix);
      return;
    }
    setLocalRun({ nightOn, run: localRun(spot.key, sample.at, spot.walk_minutes, spot.posted_minutes,
      tonight?.config?.min_dwell_extra_minutes) });
    setToast(COPY.inLineToast);
    setSheetOpen(false);
    const wire = toWireFix(sample);
    try {
      const result = await enterFrightSpot(spot.key, wire);
      if (result.ok) {
        applyResult(spot.key, result);
      } else if (!result.error || result.error === 'throttled') {
        persistQueue(enqueue(queueRef.current, { kind: 'enter', key: spot.key, nightOn, at: sample.at, fix: wire }, now()));
      } else {
        setLocalRun(null);
        setToast(ERROR_COPY[result.error] ?? COPY.closed);
      }
    } finally {
      setBusyKey(null);
    }
  }, [nightOn, busyKey, freshFix, now, tonight?.config, setLocalRun, applyResult, persistQueue]);

  const finish = useCallback(async (method: FinishMethod) => {
    if (!openRun || !nightOn || finishing.current) return;
    finishing.current = true;
    const key = openRun.key;
    setBusyKey(key);
    const sample = fix();
    const wireMethod = method === 'exit' ? 'gps' : 'button';
    try {
      // An entry still in the queue goes first.
      const pendingEnter = queueRef.current.find(item => item.kind === 'enter' && item.key === key);
      if (pendingEnter) {
        const entered = await sendAction(pendingEnter);
        persistQueue(settle(queueRef.current, pendingEnter.id, entered, now()).queue);
        if (entered.ok) applyResult(key, entered);
      }
      const result = await finishFrightSpot(key, {
        at: new Date(now()).toISOString(), method: wireMethod,
        ...(sample && method === 'exit' ? { latitude: sample.latitude, longitude: sample.longitude, accuracy: sample.accuracy } : {}),
      });
      if (result.ok) afterFinish(key, result);
      else if (!result.error || result.error === 'throttled') {
        persistQueue(enqueue(queueRef.current, { kind: 'done', key, nightOn, at: now() }, now()));
        if (method === 'button') setToast(COPY.offline);
      } else if (result.error === 'no_run' || result.error === 'too_late') {
        setLocalRun(null);
        void refresh();
      } else if (method === 'button') {
        setToast(ERROR_COPY[result.error] ?? COPY.offline);
      }
    } finally {
      finishing.current = false;
      setBusyKey(null);
    }
  }, [openRun, nightOn, fix, now, sendAction, persistQueue, applyResult, afterFinish, setLocalRun, refresh]);

  const survived = useCallback(() => finish('button'), [finish]);

  /* ---------- GPS steps ---------- */

  const nearHaunt = useRef<string | null>(null);
  useEffect(() => {
    if (!loaded || !tonight || !nightOn) return;
    const sample = fix();
    const t = now();
    // H6a: GPS exit needs 2 qualifying fixes 60 s apart (exitStep).
    if (openRun) {
      const step = exitStep(exitHold.current, openRun, openSpot, sample, t);
      exitHold.current = step.hold;
      setExitPending(!!step.hold);
      if (finishDecision({ run: openRun, spot: openSpot, now: t, exitConfirmed: step.exit })) void finish('exit');
    } else {
      exitHold.current = null;
    }
    if (!modeOn || !sample) return;
    // F1: reefs.
    const step = reefStep(reefHold.current, spots, me?.found_tonight ?? [], sample);
    if (step.hold && step.hold.key !== reefHold.current?.key) enqueueCoach('reef_first');
    reefHold.current = step.hold;
    if (step.found) {
      const found = step.found;
      const fixes = found.fixes.map(toWireFix);
      void findFrightSpot(found.key, fixes).then(result => {
        if (result.ok) afterFound(found.key, result);
        else if (!result.error || result.error === 'throttled') {
          persistQueue(enqueue(queueRef.current, { kind: 'found', key: found.key, nightOn, at: found.fixes[1].at, fixes }, now()));
        }
      });
    }
    // Coach: first time near a haunt line.
    if (!openRun) {
      const near = spots.find(spot => spot.kind === 'haunt' && canEnter(spot, sample, t).ok);
      if (near && nearHaunt.current !== near.key) enqueueCoach('haunt_near');
      nearHaunt.current = near?.key ?? null;
    }
  }, [location, loaded, tonight, modeOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // F1: standing still in a reef makes no new GPS samples; ask for one after the 45 s gap.
  const [reefPoll, setReefPoll] = useState(0);
  useEffect(() => {
    const hold = reefHold.current;
    if (!hold || !modeOn || !foreground || !nightOn) return;
    const wait = Math.max(reefPoll ? 15_000 : 1000, hold.first.at + 46_000 - now());
    const timer = setTimeout(() => {
      void freshFix(5_000).then(sample => {
        if (!sample || !reefHold.current) return;
        const step = reefStep(reefHold.current, spots, me?.found_tonight ?? [], sample);
        reefHold.current = step.hold;
        if (step.found) {
          const found = step.found;
          const fixes = found.fixes.map(toWireFix);
          void findFrightSpot(found.key, fixes).then(result => {
            if (result.ok) afterFound(found.key, result);
            else if (!result.error || result.error === 'throttled') {
              persistQueue(enqueue(queueRef.current, { kind: 'found', key: found.key, nightOn, at: found.fixes[1].at, fixes }, now()));
            }
          });
        } else {
          setReefPoll(value => value + 1);
        }
      });
    }, wait);
    return () => clearTimeout(timer);
  }, [location, reefPoll, modeOn, foreground, nightOn]); // eslint-disable-line react-hooks/exhaustive-deps

  // H6a: a player who stops walking after the first exit fix gets no new samples; ask for one after 60 s.
  // (There is deliberately no next-app-open finish: unlocking the phone in line never credits a haunt.)
  useEffect(() => {
    const hold = exitHold.current;
    if (!exitPending || !hold || !openRun || !foreground) return;
    const timer = setTimeout(() => {
      void freshFix(5_000).then(sample => {
        if (!exitHold.current) return;
        const step = exitStep(exitHold.current, openRun, openSpot, sample, now());
        exitHold.current = step.hold;
        setExitPending(!!step.hold);
        if (finishDecision({ run: openRun, spot: openSpot, now: now(), exitConfirmed: step.exit })) void finish('exit');
      });
    }, Math.max(1000, hold.first.at + 61_000 - now()));
    return () => clearTimeout(timer);
  }, [exitPending, openRun, foreground]); // eslint-disable-line react-hooks/exhaustive-deps

  // Offline queue: retry while open.
  useEffect(() => {
    if (!loaded || !foreground || !queue.length) return;
    let busy = false;
    const flush = async () => {
      if (busy) return;
      busy = true;
      try {
        let next = pruneQueue(queueRef.current, now());
        for (const action of dueActions(next, now())) {
          const result = await sendAction(action);
          next = settle(next, action.id, result, now()).queue;
          if (result.ok && action.kind === 'enter') applyResult(action.key, result);
          if (result.ok && action.kind === 'done') afterFinish(action.key, result);
          if (result.ok && action.kind === 'found') afterFound(action.key, result);
        }
        if (next.length !== queueRef.current.length || next.some((item, i) => item !== queueRef.current[i])) persistQueue(next);
      } finally {
        busy = false;
      }
    };
    void flush();
    const timer = setInterval(() => { void flush(); }, 20_000);
    return () => clearInterval(timer);
  }, [loaded, foreground, queue.length]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Night record and the Marquee (F4) ---------- */

  useEffect(() => {
    if (!loaded || !tonight || !modeOn) return;
    setRecord(current => {
      const next = nightRecordFrom(tonight, current);
      if (next && JSON.stringify(next) !== JSON.stringify(current)) void writeKey(FRIGHT_KEYS.night, JSON.stringify(next));
      return next;
    });
  }, [loaded, tonight, modeOn]);

  const offerRecap = useCallback((slug: string, on: string) => {
    setRecord(current => {
      const next = current ? { ...current, offered: true } : current;
      void writeKey(FRIGHT_KEYS.night, next ? JSON.stringify(next) : null);
      return next;
    });
    setSheetOpen(false);
    setRecapOffer({ slug, nightOn: on });
    void markFrightRecapSeen(slug, on);
  }, []);

  useEffect(() => {
    if (!loaded || !record || !foreground) return;
    const sameNight = tonight?.night?.night_on === record.nightOn;
    const hit = recapTrigger({
      record, now: now(), phase, phaseNightOn: tonight?.night?.night_on ?? null,
      serverSeen: sameNight ? !!me?.recap_seen : false,
      parkLeft: night.leftEventPark, appOpened: !isOnPhase(phase),
    });
    if (hit && !openRun) offerRecap(hit.slug, hit.nightOn);
  }, [loaded, record, foreground, phase, night.leftEventPark, openCount]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- Tutorial and coach marks ---------- */

  useEffect(() => {
    if (!loaded || !modeOn || !event || tutorial || quiet || opts.blocked) return;
    const plan = introPlan({ seen, returning: me?.returning });
    if (plan) setTutorial(plan);
  }, [loaded, modeOn, event?.slug, quiet, opts.blocked]); // eslint-disable-line react-hooks/exhaustive-deps

  const finishTutorial = useCallback(() => {
    if (tutorial === 'intro' || tutorial === 'welcome_back') markSeen(tutorial);
    setTutorial(null);
  }, [tutorial, markSeen]);
  const replayTutorial = useCallback(() => { setSheetOpen(false); setTutorial('replay'); }, []);

  // Chaos Hour coach mark.
  const encounter = tonight?.encounter ?? null;
  useEffect(() => {
    if (modeOn && encounter && encounterLive(encounter, now()) && isChaosHour(encounter.starts_at, encounter.ends_at)) {
      enqueueCoach('chaos_hour');
    }
  }, [modeOn, encounter?.key]); // eslint-disable-line react-hooks/exhaustive-deps

  const canCoach = modeOn && focused && foreground && !quiet && !opts.blocked && !sheetOpen && !tutorial && !rank && !caseFile && !recapOffer && !marquee;
  useEffect(() => {
    setCoach(state => coachTick(state, Date.now(), canCoach, seen));
  }, [canCoach, coach.queue.length, coach.visible, seen]);
  useEffect(() => {
    const wait = coachWaitMs(coach, Date.now());
    if (wait == null || wait === 0 || !canCoach) return;
    const timer = setTimeout(() => setCoach(state => coachTick(state, Date.now(), true, seen)), wait + 50);
    return () => clearTimeout(timer);
  }, [coach, canCoach, seen]);
  const dismissCoach = useCallback(() => {
    setCoach(state => {
      if (state.visible) markSeen(state.visible);
      return coachDismiss(state, Date.now());
    });
  }, [markSeen]);

  // Toasts never show during phones-down, except the Shusher line itself.
  const visibleToast = toast && (!quiet || toast === COPY.inLineToast) ? toast : null;
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  /* ---------- Rank ---------- */

  const myRankOf = useCallback((key: string): number | null => {
    const runs = me?.runs ?? [];
    const mine = runs.find(run => run.key === key)?.score;
    if (mine == null) return null;
    return 1 + runs.filter(run => run.key !== key && (run.score ?? 0) > mine).length;
  }, [me?.runs]);

  const submitRank = useCallback(async (score: number, reaction: FrightReaction | null) => {
    if (!rank) return null;
    const key = rank.key;
    const result = await scoreFrightSpot(key, score, reaction);
    if (!result.ok) return null;
    lastScores.current[key] = score;
    applyResult(key, result, { patch: { score, reaction } });
    const runs = (me?.runs ?? []).map(run => run.key === key ? { ...run, score } : run);
    const myRank = 1 + runs.filter(run => run.key !== key && (run.score ?? 0) > score).length;
    return { fanRank: result.fan?.rank ?? null, myRank };
  }, [rank, applyResult, me?.runs]);

  const doneKeys = useMemo(() => (me?.runs ?? []).filter(run => run.done_at).map(run => run.key), [me?.runs]);

  return {
    spooky, setSpooky, ambient: ambientOn, setAmbient, sheetOpen, setSheetOpen, focusKey, openSheetAt,
    pillBottom, setPillBottom, exitPending, openRun, openSpot, quiet,
    canSurvive: stage === 'ready', busyKey, pendingSync: queue.length,
    enter, survived,
    // UI gate: closed, too far or no GPS yet disable the button; a stale or rough fix is refreshed on tap.
    enterCheck: (spot: FrightSpot) => {
      const sample = fix();
      const check = canEnter(spot, sample ? { ...sample, accuracy: Math.min(sample.accuracy ?? 50, 50) } : null,
        sample?.at ?? now(), { enterAccuracyM: 50 });
      return check.reason === 'not_accepting' || check.reason === 'too_far' || check.reason === 'no_fix' ? check
        : { ok: true, distance: check.distance };
    },
    rank: quiet ? null : rank, submitRank, closeRank: () => setRank(null),
    caseFile: quiet ? null : caseFile, closeCaseFile: () => setCaseFile(null),
    toast: visibleToast, clearToast: () => setToast(null),
    tutorial: quiet || opts.blocked ? null : tutorial, finishTutorial, replayTutorial,
    coach: canCoach ? coach.visible : null, dismissCoach,
    recapOffer, dismissRecapOffer: () => setRecapOffer(null),
    marquee, openMarquee: (slug, on) => { setRecapOffer(null); setMarquee({ slug, nightOn: on }); if (event) markSeen('recap'); },
    closeMarquee: () => setMarquee(null),
    doneKeys, art, myRankOf,
  };
}
