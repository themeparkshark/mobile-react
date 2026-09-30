/**
 * Dev-only visual QA tour for LinePlay (EXPO_PUBLIC_LINEPLAY_FLOW_PREVIEW=1
 * plus EXPO_PUBLIC_LINEPLAY_PREVIEW_TOUR=1). Steps through every queue state
 * on a timer so simulator screenshots can be taken without touch input. Never
 * runs in a release build.
 */
import { answerCrewTrivia, chooseCrewObservation, chooseCrewRoute, chooseCrewSize, hideCrewMemory,
  pickCrewMemory, readyForCrewTurn } from '../../services/lineplay/crewRelay';
import { createNavigationPanel, nextNavigationRepair } from '../../services/lineplay/navigationPanel';
import type { LinePlaySession } from '../../services/lineplay/LinePlaySession';
import { LogBox } from 'react-native';

export const LINEPLAY_TOUR_STEP_MS = 9000;

export function linePlayTourEnabled(): boolean {
  const on = __DEV__ && process.env.EXPO_PUBLIC_LINEPLAY_FLOW_PREVIEW === '1' &&
    process.env.EXPO_PUBLIC_LINEPLAY_PREVIEW_TOUR === '1';
  // Clean screenshots: the dev warning toast would cover the footer.
  if (on) LogBox.ignoreAllLogs(true);
  return on;
}

export interface LinePlayTourControls {
  readonly session: LinePlaySession;
  readonly jumpToId: (id: string) => void;
  readonly jumpToKind: (kind: string) => void;
  readonly openArcade: (open: boolean) => void;
  readonly openEndSheet: (open: boolean) => void;
  readonly showAdvanceToast: () => void;
  readonly startResume: () => void;
}

export function solveChapterCircuit(session: LinePlaySession): void {
  const chapter = session.snapshot().chapter;
  if (!chapter) return;
  const id = `${chapter.id}-trivia`;
  const item = session.snapshot().playlist.find(entry => entry.id === id);
  if (item?.kind !== 'trivia') return;
  for (let step = 0; step < 48; step++) {
    const progress = session.snapshot().navigationPanels?.[id];
    const round = progress?.round ?? 0;
    const index = progress ? nextNavigationRepair(createNavigationPanel(item.seed, round), progress) : 0;
    if (index == null) return;
    session.rotateNavigationPanel(id, index);
  }
}

/** A crew mid-way through the Decoder turn, two symbols placed. */
export function relayMidRecall(session: LinePlaySession): void {
  let relay = session.snapshot().crewRelay;
  if (!relay) return;
  relay = chooseCrewSize(relay, 3);
  relay = answerCrewTrivia(relay, 0, 0);
  relay = readyForCrewTurn(relay);
  relay = chooseCrewObservation(relay, 'shape');
  relay = readyForCrewTurn(relay);
  relay = hideCrewMemory(relay);
  relay = pickCrewMemory(relay, relay.memorySequence[0]);
  relay = pickCrewMemory(relay, relay.memorySequence[1]);
  session.updateCrewRelay(relay);
}

export function finishCrewRelay(session: LinePlaySession): void {
  let relay = session.snapshot().crewRelay;
  if (!relay) return;
  relay = chooseCrewSize(relay, 3);
  relay = answerCrewTrivia(relay, 0, 0);
  relay = readyForCrewTurn(relay);
  relay = chooseCrewObservation(relay, 'sound');
  relay = readyForCrewTurn(relay);
  relay = hideCrewMemory(relay);
  for (const symbol of relay.memorySequence) relay = pickCrewMemory(relay, symbol);
  relay = readyForCrewTurn(relay);
  relay = chooseCrewRoute(relay, 'alpha');
  session.updateCrewRelay(relay);
}

/** The ordered tour. Each entry runs once, LINEPLAY_TOUR_STEP_MS apart. */
export function linePlayTourSteps(c: LinePlayTourControls): Array<() => void> {
  const chapterId = () => c.session.snapshot().chapter?.id ?? '';
  return [
    () => undefined, // 0: chapter page
    () => c.jumpToId(`${chapterId()}-trivia`), // 1: Signal Repair mission
    () => solveChapterCircuit(c.session), // 2: solved circuit payoff
    () => { relayMidRecall(c.session); c.jumpToId(`${chapterId()}-crew-relay`); }, // 3: relay art tiles
    () => { finishCrewRelay(c.session); c.jumpToId(`${chapterId()}-crew-relay`); }, // 4: crew story payoff
    () => c.jumpToKind('circuit'), // 4: free-play themed circuit
    () => { c.jumpToKind('minigame-free'); c.showAdvanceToast(); }, // 5: arcade card + heads up
    () => c.openArcade(true), // 6: Queue Arcade sheet
    () => { c.openArcade(false); c.session.pause('manual'); }, // 7: paused
    () => c.startResume(), // 8: 3-2-1
    () => c.openEndSheet(true), // 9: wait-end sheet
    () => c.openEndSheet(false),
    () => c.session.beginEnding(false, 'left_queue'), // ride up
    () => { void c.session.endNow(true); }, // 11: recap
  ];
}
