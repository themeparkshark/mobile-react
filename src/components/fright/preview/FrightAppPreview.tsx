/**
 * Dev-only capture states for the Fin-ister app layer (panel round 1 fixes).
 * Renders the REAL components (FrightPill, FrightLayer, FrightSheet,
 * RankCard, coach marks, Marquee) over the real map with the FX layer, fed by
 * mocked FrightNight / FrightEngine objects built from the USF fixture. Never
 * routed in production (devRoutes, EXPO_PUBLIC_FRIGHT_INTRO_PREVIEW only).
 */
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FrightRun, FrightSpot, FrightTonight } from '../../../api/endpoints/fright';
import type { RideControlPark } from '../../../api/endpoints/parks/rideControl';
import Map from '../../Map';
import RideControlBar from '../../RideControlBar';
import { USF_FRIGHT_SPOTS, usfFrightFixture } from '../../map/fright/preview/usfFixture';
import type { FrightMapInput } from '../../map/fright';
import type { FrightNight } from '../../../hooks/useFrightNight';
import { NO_ART } from '../../../services/fright/art';
import { FRIGHT_MODE_NAME } from '../../../services/fright/config';
import { COPY } from '../../../services/fright/copy';
import FrightLayer from '../FrightLayer';
import FrightPill from '../FrightPill';
import RankCard from '../RankCard';
import type { FrightEngine } from '../useFrightEngine';

export const APP_PREVIEW_STATES = ['map-chips', 'sheet-focus', 'in-line', 'survive-ready', 'rank', 're-swim', 'coach-pill',
  'marquee-retry', 'marquee-zero-gate'] as const;
export type AppPreviewState = typeof APP_PREVIEW_STATES[number];
/** Seconds each state holds in the 'cycle' (the Marquee waits out the 12 s load timeout). */
export const APP_PREVIEW_SECONDS: Readonly<Record<AppPreviewState, number>> = {
  'map-chips': 8, 'sheet-focus': 8, 'in-line': 8, 'survive-ready': 8, rank: 8, 're-swim': 8, 'coach-pill': 8,
  'marquee-retry': 16, 'marquee-zero-gate': 8,
};

const ROBOT = 'usf26-robot-city';
const PLAYER = { latitude: 28.47805, longitude: -81.4692 };
const FOCUS = { latitude: 28.4787, longitude: -81.4686, zoom: 16.3, requestId: 1 };

/** Posted waits that make The Farmhouse UFO the shortest open line (30 min). */
const WAITS: Record<string, number> = {
  'usf26-farmhouse-ufo': 30, [ROBOT]: 60, 'usf26-host-hammerhead': 55, 'usf26-juke-joint': 75, 'usf26-puzzle-box': 45,
  'usf26-tug-of-the-tides': 90, 'usf26-creaky-book': 50, 'usf26-flicker-light-town': 85, 'usf26-rock-legend': 40, 'usf26-wild-zoo': 20,
};

/** Disabled reasons in the sheet: one of each kind, the rest too far at their own distance. */
const CHECKS: Record<string, ReturnType<FrightEngine['enterCheck']>> = {
  [ROBOT]: { ok: true, distance: 22 },
  'usf26-farmhouse-ufo': { ok: false, reason: 'too_far', distance: 137 },
  'usf26-wild-zoo': { ok: false, reason: 'not_accepting' },
  'usf26-puzzle-box': { ok: false, reason: 'no_fix' },
};

function tonightFor(now: number, runs: readonly FrightRun[], openRun: FrightRun | null): FrightTonight {
  const base = usfFrightFixture(now, 'live');
  const spots: FrightSpot[] = USF_FRIGHT_SPOTS.map(spot => spot.kind === 'haunt'
    ? { ...spot, posted_minutes: WAITS[spot.key] ?? spot.posted_minutes } : spot);
  return {
    ...base, spots, encounter: null,
    me: { runs, open_run: openRun, haunts_tonight: runs.filter(run => run.done_at).length, haunts_season: 0, haunts_total: 0,
      side: null, lantern: { level: 1, parts: 0, next_at: 10 }, found_tonight: [], recap_seen: false, seen: {}, returning: false },
  };
}

function runAt(now: number, enteredMinutesAgo: number, minDoneInMinutes: number): FrightRun {
  return { key: ROBOT, entered_at: new Date(now - enteredMinutesAgo * 60_000).toISOString(), done_at: null,
    min_done_at: new Date(now + minDoneInMinutes * 60_000).toISOString(), wait_minutes: null, posted_minutes: 60,
    score: null, reaction: null, re_swim: false };
}

const noop = () => {};
const RIDE_CONTROL = { park_day: '2026-10-02', rides_held: { mouse: 0, globe: 0, shark: 0 }, leading_team: null, your_team: null,
  your_team_is_underdog: false, rides: [], points: {}, player_daily_cap: 0 } as unknown as RideControlPark;

export default function FrightAppPreview({ state }: { readonly state: AppPreviewState }) {
  const insets = useSafeAreaInsets();
  const [now] = useState(() => Date.now());
  const [pillBottom, setPillBottom] = useState<number | null>(null);
  const [sheetLate, setSheetLate] = useState(false);
  // 'in-line' shows the pill and the entry toast first, then opens the sheet at 4 s.
  useEffect(() => {
    setSheetLate(false);
    if (state !== 'in-line') return;
    const timer = setTimeout(() => setSheetLate(true), 4000);
    return () => clearTimeout(timer);
  }, [state]);

  const openRun = state === 'in-line' ? runAt(now, 12, 12) : state === 'survive-ready' ? runAt(now, 26, -2) : null;
  const tonight = useMemo(() => tonightFor(now, openRun ? [openRun] : [], openRun), [now, state]); // eslint-disable-line react-hooks/exhaustive-deps
  const robot = tonight.spots.find(spot => spot.key === ROBOT) ?? null;

  const night: FrightNight = {
    tonight, phase: 'live', modeOn: true, eventPark: true, leftEventPark: false, offset: 0, title: FRIGHT_MODE_NAME,
    foreground: true, openCount: 1, now: () => Date.now(), refresh: async () => {}, applyResult: noop, setCalm: noop,
  };
  const engine: FrightEngine = {
    spooky: true, setSpooky: noop, ambient: false, setAmbient: noop,
    sheetOpen: state === 'sheet-focus' || state === 'survive-ready' || (state === 'in-line' && sheetLate),
    setSheetOpen: noop, focusKey: state === 'sheet-focus' ? ROBOT : null, openSheetAt: noop,
    pillBottom, setPillBottom, exitPending: false,
    openRun, openSpot: openRun ? robot : null, quiet: state === 'in-line', canSurvive: state === 'survive-ready',
    busyKey: null, pendingSync: 0, enter: async () => {}, survived: async () => {},
    enterCheck: spot => CHECKS[spot.key] ?? { ok: false, reason: 'too_far', distance: 300 + spot.sort * 40 },
    modal: null, closeModal: noop, encounter: null, catchEncounter: async () => {}, pickSide: async () => {},
    rank: null, submitRank: async () => null, closeRank: noop, caseFile: null, closeCaseFile: noop,
    toast: state === 'in-line' ? COPY.inLineToast : null, clearToast: noop,
    tutorial: null, finishTutorial: noop, replayTutorial: noop,
    coach: state === 'coach-pill' ? 'haunt_near' : null, dismissCoach: noop,
    recapOffer: null, dismissRecapOffer: noop,
    marquee: state === 'marquee-retry' ? { slug: 'preview-missing', nightOn: '2026-10-02' } : null,
    openMarquee: noop, closeMarquee: noop, doneKeys: [], art: NO_ART, myRankOf: () => null,
  };

  const mapInput: FrightMapInput = {
    tonight, active: true, nowOffsetMs: 0, player: PLAYER, spooky: true, doneKeys: [], quiet: engine.quiet,
    cinematic: null, onHauntPress: noop, tierCap: 'lite', ambience: false,
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map fright={mapInput} focusCoordinate={FOCUS}>{null}</Map>
      <View style={[styles.column, { top: insets.top + 8 }]} pointerEvents="box-none">
        <RideControlBar control={RIDE_CONTROL} tasks={[]} onFocusTask={noop} hideAllOpen />
        <FrightPill night={night} engine={engine} onHelp={noop} />
      </View>
      <FrightLayer night={night} engine={engine} top={insets.top + 140} />
      {(state === 'rank' || state === 're-swim') && (
        <RankCard key={state} onSubmit={async () => null} onClose={noop}
          prompt={{ key: ROBOT, name: 'The Robot City', reSwim: state === 're-swim', lastScore: state === 're-swim' ? 4 : null }}
          initialScore={state === 'rank' ? 4 : null}
          initialResult={state === 'rank' ? `Locked in. ${COPY.fanRankingsCount}` : null} />
      )}
      {state === 'marquee-zero-gate' && (
        <View style={[styles.caption, { bottom: insets.bottom + 110 }]} pointerEvents="none">
          <Text style={styles.captionText}>DEV: 0 haunts logged tonight, so no exit card and no Marquee offer.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  column: { position: 'absolute', left: 0, right: 0, zIndex: 25 },
  caption: { position: 'absolute', left: 16, right: 16, padding: 10, borderRadius: 12, backgroundColor: 'rgba(30,24,70,0.85)' },
  captionText: { color: '#E4DAFF', fontSize: 13, textAlign: 'center' },
});
