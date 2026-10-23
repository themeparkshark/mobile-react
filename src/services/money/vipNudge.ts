/**
 * The VIP line on a win card, shown rarely (money honesty, Oct 23 2026).
 *
 * A win is a kid's happy moment, so it is not an ad slot. The line:
 * - never shows on a player's first 3 wins on this phone,
 * - shows at most once every 3 days after that,
 * - is only ever mounted on a win (PostWinRewardsModal is the win sheet), never on a loss,
 * - says what members get ("VIP members get 2x coins and XP"), never "you would have had".
 *
 * Pure rules (vipNudgeDue, nextVipNudgeState) are tested in
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

/** Count one win, and decide. Returns the state to save and whether the line shows. */
export function nextVipNudgeState(previous: VipNudgeState | null, today: string): { state: VipNudgeState; show: boolean } {
  const counted: VipNudgeState = { wins: Math.max(0, previous?.wins ?? 0) + 1, lastDay: previous?.lastDay ?? null };
  const show = vipNudgeDue(counted, today);
  return { state: show ? { ...counted, lastDay: today } : counted, show };
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

/**
 * True when this win card may show the VIP line. `winKey` changes once per
 * win shown (null while hidden or for VIP players), so each win counts once.
 * Storage that fails just means no line this time.
 */
export function useVipNudge(winKey: string | number | null): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(false);
    if (winKey == null) return undefined;
    let live = true;
    void AsyncStorage.getItem(VIP_NUDGE_KEY).then(raw => {
      const next = nextVipNudgeState(parse(raw), localDay());
      void AsyncStorage.setItem(VIP_NUDGE_KEY, JSON.stringify(next.state)).catch(() => undefined);
      if (live) setShow(next.show);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [winKey]);
  return show;
}
