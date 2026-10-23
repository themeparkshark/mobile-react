/**
 * The VIP line on a win card, shown rarely (money honesty, Oct 23 2026).
 *
 * A win is a kid's happy moment, so it is not an ad slot. The line:
 * - never shows on a player's first 3 wins on this phone,
 * - shows at most once every 3 days after that,
 * - is only ever mounted on a win (PostWinRewardsModal is the win sheet), never on a loss,
 * - says what members get ("VIP members get 2x coins and XP"), never "you would have had".
 *
 * The 3-day clock starts only when the line really shows (markVipNudgeShown),
 * not when it was due but the Starter card took its place. The saved count is
 * read once per app run, so the decision is ready the moment the win sheet
 * opens and the line never pops in after it.
 *
 * Pure rules (vipNudgeDue, nextVipNudgeState, stampVipNudge) are tested in
 * tools/tests/money-offers.test.cjs; the hook keeps the count on the phone.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export const VIP_NUDGE_KEY = 'tps.money.vipWinNudge.v1';
/** Wins before the line can ever show. */
export const VIP_NUDGE_FIRST_WINS = 3;
/** Days between two showings. */
export const VIP_NUDGE_GAP_DAYS = 3;

export type VipNudgeState = { readonly wins: number; readonly lastDay: string | null };

/** "2026-10-23" in the phone's own time zone. */
export function localDay(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86_400_000) : Infinity;
}

/** Does this win (already counted in `state.wins`) get the VIP line? */
export function vipNudgeDue(state: VipNudgeState, today: string): boolean {
  if (state.wins <= VIP_NUDGE_FIRST_WINS) return false;
  return state.lastDay == null || daysBetween(state.lastDay, today) >= VIP_NUDGE_GAP_DAYS;
}

/** Count one win, and decide. Returns the state to save and whether the line may show. */
export function nextVipNudgeState(previous: VipNudgeState | null, today: string): { state: VipNudgeState; show: boolean } {
  const counted: VipNudgeState = { wins: Math.max(0, previous?.wins ?? 0) + 1, lastDay: previous?.lastDay ?? null };
  return { state: counted, show: vipNudgeDue(counted, today) };
}

/** The line was really shown today: the 3-day gap starts now. */
export function stampVipNudge(state: VipNudgeState | null, today: string): VipNudgeState {
  return { wins: Math.max(0, state?.wins ?? 0), lastDay: today };
}

function parse(raw: string | null): VipNudgeState | null {
  try {
    const value = raw ? JSON.parse(raw) : null;
    if (!value || typeof value !== 'object') return null;
    const wins = Number(value.wins);
    return { wins: Number.isFinite(wins) ? wins : 0, lastDay: typeof value.lastDay === 'string' ? value.lastDay : null };
  } catch {
    return null;
  }
}

/* The phone's copy, read once per run. Storage that fails just means no line. */
let saved: VipNudgeState | null = null;
let loaded = false;
let loading: Promise<void> | null = null;
const decided = new Map<string, boolean>();
let stampedKey: string | null = null;

function save(): void {
  void AsyncStorage.setItem(VIP_NUDGE_KEY, JSON.stringify(saved)).catch(() => undefined);
}

/** Reads the saved count once per run. Call early (the win sheet's module does) so the first win is ready. */
export function warmVipNudge(): Promise<void> {
  loading ??= AsyncStorage.getItem(VIP_NUDGE_KEY)
    .then(raw => { saved = parse(raw); })
    .catch(() => undefined)
    .then(() => { loaded = true; });
  return loading;
}

/** Whether this win's line may show. Pure: reads only, so a render (or StrictMode's second render) never counts a win. */
export function peekVipNudge(key: string): boolean {
  const known = decided.get(key);
  return known !== undefined ? known : nextVipNudgeState(saved, localDay()).show;
}

/** Counts this win once (by key) and saves. Called from an effect after the render that showed the answer. */
export function countVipNudgeWin(key: string): void {
  if (decided.has(key)) return;
  const next = nextVipNudgeState(saved, localDay());
  saved = next.state;
  decided.set(key, next.show);
  save();
}

/** The chip is on screen for this win: start the 3-day gap. Once per win. */
export function markVipNudgeShown(winKey: string | number | null): void {
  if (winKey == null || stampedKey === String(winKey)) return;
  stampedKey = String(winKey);
  saved = stampVipNudge(saved, localDay());
  save();
}

/**
 * True when this win card may show the VIP line. `winKey` changes once per
 * win shown (null while hidden or for VIP players), so each win counts once.
 * The answer is ready on the first render once the saved count has loaded.
 */
export function useVipNudge(winKey: string | number | null): boolean {
  const [ready, setReady] = useState(loaded);
  useEffect(() => {
    if (ready) return undefined;
    let live = true;
    void warmVipNudge().then(() => { if (live) setReady(true); });
    return () => { live = false; };
  }, [ready]);
  const key = winKey != null && ready ? String(winKey) : null;
  // Decided in render (ready on the first paint, the store is warmed), counted in an effect.
  const show = key != null && peekVipNudge(key);
  useEffect(() => { if (key != null) countVipNudgeWin(key); }, [key]);
  return show;
}
