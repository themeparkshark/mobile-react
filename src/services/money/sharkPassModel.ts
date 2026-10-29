/**
 * Shark Pass words and sums, pure (tools/tests/money-offers.test.cjs).
 */
import type { SharkPassReward, SharkPassState, SharkPassTier } from '../../api/endpoints/me/shark-pass';
import type { GameIconName } from '../../ui/iconNames';
import countText from '../../helpers/countText';

/** The server's events in the player's words. Unknown events are left out. */
export const EVENT_COPY: Record<string, { label: string; icon: GameIconName }> = {
  ride_coin_win: { label: 'Win a ride coin', icon: 'coin' },
  mini_game_win: { label: 'Win a mini-game', icon: 'trophy' },
  home_find: { label: 'Find a treat', icon: 'search' },
  coin_level_up: { label: 'Level up a ride coin', icon: 'parts' },
  daily3_complete: { label: 'Finish your Daily 3', icon: 'check' },
  level_up: { label: 'Level up your shark', icon: 'xp' },
  trail_box_open: { label: 'Open a Trail Box', icon: 'chest' },
  pin_of_day: { label: 'Catch the Pin of the Day', icon: 'pin' },
  mystery_box_open: { label: 'Open a Mystery Pin Box', icon: 'gift' },
  first_win: { label: 'First win of the day', icon: 'star' },
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-12-27' -> 'Sunday, December 27' (the parks' calendar day, never relative). */
export function lastDayText(ymd: string): string {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) return ymd;
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[day]}, ${MONTHS[m - 1]} ${d}`;
}

/** A season wearable: a pin, a scene or a profile frame. */
export type Wearable = Extract<SharkPassReward, { type: 'item' | 'frame' }>;
export function isWearable(r: SharkPassReward | null | undefined): r is Wearable {
  return !!r && (r.type === 'item' || r.type === 'frame');
}

/** "2 Shark Coins" style words for a reward (one word per thing). Exported for tests. */
export function rewardWords(reward: SharkPassReward): string {
  switch (reward.type) {
    case 'item': case 'frame': return reward.name;
    case 'mystery_box': return reward.boxes === 1 ? '1 Mystery Pin Box' : `${reward.boxes} Mystery Pin Boxes`;
    case 'rescue_passes': return reward.amount === 1 ? '1 Extra try' : `${reward.amount} Extra tries`;
    case 'tickets': return `${reward.amount} ${reward.amount === 1 ? 'Ticket' : 'Tickets'}`;
    case 'energy': return `${reward.amount} Energy`;
    default: return `${countText(reward.amount)} Shark Coins`;
  }
}

/** "6 winter items, 9 Mystery Pin Boxes, 2,550 coins and more" from the real Shark Pass row. */
export function passSummary(tiers: readonly SharkPassTier[]): string {
  let items = 0; let boxes = 0; let coins = 0;
  for (const t of tiers) {
    const r = t.paid;
    if (isWearable(r)) items += 1;
    else if (r.type === 'mystery_box') boxes += r.boxes;
    else if (r.type === 'coins') coins += r.amount;
  }
  const parts = [
    items ? `${items} season ${items === 1 ? 'item' : 'items'}` : null,
    boxes ? `${boxes} Mystery Pin ${boxes === 1 ? 'Box' : 'Boxes'}` : null,
    coins ? `${countText(coins)} Shark Coins` : null,
  ].filter(Boolean);
  return parts.length ? `${parts.join(', ')} and more` : 'A reward on every step';
}


/**
 * The next wearable prize, one rule everywhere (the banner and the pass screen, the server's
 * progress.next_prize): a free player's next free prize; a Shark Pass owner's next prize on the
 * Shark Pass row first, then the free row. Never the paid row as a tease for a free player.
 */
export function nextBigPrize(tiers: readonly SharkPassTier[], points: number, perStep: number, premium = false):
  { tier: number; reward: SharkPassReward; pass: boolean; pointsAway: number } | null {
  for (const t of tiers) {
    if (t.unlocked) continue;
    const reward = premium ? (isWearable(t.paid) ? t.paid : isWearable(t.free) ? t.free : null) : isWearable(t.free) ? t.free : null;
    if (!reward) continue;
    return { tier: t.tier, reward, pass: reward === t.paid, pointsAway: Math.max(0, t.tier * Math.max(1, perStep) - points) };
  }
  return null;
}

/** The one next prize for a pass state: the server's answer when it sends one, else the same rule here. */
export function nextPassPrize(state: SharkPassState | null | undefined):
  { tier: number; reward: SharkPassReward; pass: boolean; pointsAway: number } | null {
  if (!state || !state.enabled || !state.season || !state.progress) return null;
  const server = (state.progress as { next_prize?: { tier: number; track: 'free' | 'paid'; reward: SharkPassReward; points_away: number } | null }).next_prize;
  if (server && server.reward && Number.isFinite(server.tier)) {
    return { tier: server.tier, reward: server.reward, pass: server.track === 'paid', pointsAway: Math.max(0, Number(server.points_away) || 0) };
  }
  return nextBigPrize(state.tiers ?? [], state.progress.points, state.season.points_per_tier, !!state.progress.premium);
}

/** "Step 4 of 50": the pass's progress words (never "pts"). */
export function stepWords(step: number, of: number): string {
  return `Step ${Math.max(0, step)} of ${Math.max(1, of)}`;
}

/**
 * Daily 3 is the only daily list (core loop 5.8): when the server sends no daily pass quests,
 * the quests area points to Daily 3 instead (finishing it pays pass points). The weekly quest stays.
 * The link shows only when Daily 3 is really there for this player (its switch on and rung 4 open);
 * before that the area says plainly when daily goals come, with no arrow and no dead tap.
 */
export type DailyQuestsSlot = 'list' | 'daily3' | 'later';
export function dailyQuestsSlot(quests: { readonly daily: readonly unknown[] } | null | undefined, daily3Ready: boolean): DailyQuestsSlot {
  if (!quests || quests.daily.length > 0) return 'list';
  return daily3Ready ? 'daily3' : 'later';
}
export function questsLinkDaily3(quests: { readonly daily: readonly unknown[] } | null | undefined, daily3Ready = true): boolean {
  return dailyQuestsSlot(quests, daily3Ready) === 'daily3';
}
/**
 * A pass quest's words as a kid reads them. The server still names the home hunt "home finds" or "snacks"
 * ("Grab 8 home finds"); the app calls them treats everywhere, so the pass does too (until be-core-loop
 * removes daily pass quests). Only those words change; numbers and the rest of the line stay as sent.
 */
export function passQuestLabel(label: string): string {
  const cap = (m: string, word: string) => (m[0] === m[0].toUpperCase() ? word[0].toUpperCase() + word.slice(1) : word);
  return label
    .replace(/\bhome finds\b/gi, m => cap(m, 'treats'))
    .replace(/\bhome find\b/gi, m => cap(m, 'treat'))
    .replace(/\bsnacks\b/gi, m => cap(m, 'treats'))
    .replace(/\bsnack\b/gi, m => cap(m, 'treat'));
}

/**
 * Lane checks only: the pass as be-core-loop will send it (no daily pass quests), so the Daily 3 link and the
 * "later" line can be seen on device before that server ships. Inert unless BOTH lane-only bundle variables are set:
 * EXPO_PUBLIC_STUDIO_MUTE=1 (only lane.sh sets it) and EXPO_PUBLIC_CL_PASS_FIXTURE=empty-daily. Store and OTA
 * bundles set neither, so there it returns the server's answer untouched.
 */
export function lanePassFixture<T>(state: T, env: Readonly<Record<string, string | undefined>> = {
  mute: process.env.EXPO_PUBLIC_STUDIO_MUTE, fixture: process.env.EXPO_PUBLIC_CL_PASS_FIXTURE,
}): T {
  if (env.mute !== '1' || env.fixture !== 'empty-daily') return state;
  const s = state as unknown as { enabled?: boolean; quests?: { daily: readonly unknown[] } | null };
  if (!s || !s.enabled || !s.quests) return state;
  return { ...s, quests: { ...s.quests, daily: [] } } as unknown as T;
}

/** The plain line before Daily 3 unlocks (no arrow, nothing to tap). */
// Rung 4 opens after the first park day or the third home day, so the line names neither.
export const DAILY_GOALS_LATER = 'Daily goals open up as you play';

/** "You'd get 7 rewards right now: Frosty Scarf Pin, 450 coins and more" for the unlock panel. */
export function readyNowLine(tiers: readonly SharkPassTier[]): string | null {
  const ready = tiers.filter(t => t.unlocked).map(t => t.paid);
  if (!ready.length) return null;
  const items = ready.filter(isWearable).map(r => rewardWords(r));
  const coins = ready.reduce((n, r) => n + (r.type === 'coins' ? r.amount : 0), 0);
  const boxes = ready.reduce((n, r) => n + (r.type === 'mystery_box' ? r.boxes : 0), 0);
  const parts = [...items, boxes ? `${boxes} Mystery Pin ${boxes === 1 ? 'Box' : 'Boxes'}` : null, coins ? `${countText(coins)} Shark Coins` : null]
    .filter(Boolean).slice(0, 3);
  return `Get ${ready.length} Shark Pass ${ready.length === 1 ? 'reward' : 'rewards'} right away: ${parts.join(', ')}${ready.length > parts.length ? ' and more' : ''}.`;
}

/** What a "Claim all" landed, in words: the first three, then "and N more". */
export function claimedLine(rewards: readonly SharkPassReward[]): string {
  // Best first: items, then coins, tickets, Rescue Passes, boxes, energy. Six or fewer are all named.
  const rank: Record<string, number> = { item: 0, frame: 0, coins: 1, tickets: 2, rescue_passes: 3, mystery_box: 4, energy: 5 };
  const words = [...rewards].sort((a, b) => (rank[a.type] ?? 9) - (rank[b.type] ?? 9)).map(rewardWords);
  if (words.length <= 6) return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : words[0] ?? '';
  return words.length <= 3 ? words.join(', ') : `${words.slice(0, 3).join(', ')} and ${words.length - 3} more`;
}

/** "With the Shark Pass you'd also have: Frosty Scarf Pin, Cocoa Mug Pin and 4 more." for steps already reached. */
export function passTwinLine(tiers: readonly SharkPassTier[], premium: boolean): string | null {
  if (premium) return null;
  const waiting = tiers.filter(t => t.unlocked && !t.paid_claimed).map(t => t.paid);
  if (!waiting.length) return null;
  const items = waiting.filter(isWearable);
  const lead = [...items, ...waiting.filter(r => !isWearable(r))].slice(0, 2).map(rewardWords);
  return `With the Shark Pass you’d also have ${lead.join(', ')}${waiting.length > lead.length ? ` and ${waiting.length - lead.length} more` : ''}.`;
}

/** The Shark Pass row's coins, tickets and Rescue Passes added up (energy and pins are listed apart). */
export function passGrants(tiers: readonly SharkPassTier[]): { coins: number; tickets: number; rescue_passes: number; pins: number } {
  const out = { coins: 0, tickets: 0, rescue_passes: 0, pins: 0 };
  for (const { paid } of tiers) {
    if (isWearable(paid)) out.pins += 1;
    else if (paid.type === 'coins' || paid.type === 'tickets' || paid.type === 'rescue_passes') out[paid.type] += paid.amount;
  }
  return out;
}

/** "about 9 ride coin wins away", from the server's own points for a win. Null when unknown. */
export function winsAwayText(pointsAway: number, today: readonly { event: string; points: number }[]): string | null {
  const win = today.find(e => e.event === 'ride_coin_win')?.points ?? 0;
  if (win <= 0 || pointsAway <= 0) return null;
  const n = Math.ceil(pointsAway / win);
  return `about ${n} ride coin ${n === 1 ? 'win' : 'wins'} away`;
}

/** "4 free, 13 on the Shark Pass, 1 with Plus": the set's count, free first. */
export function setMixText(pieces: readonly { row: 'free' | 'pass' | 'plus' }[]): string {
  const c = (r: string) => pieces.filter(p => p.row === r).length;
  return [`${c('free')} free`, `${c('pass')} on the Shark Pass`, ...(c('plus') ? [`${c('plus')} with Plus`] : [])].join(', ');
}

export type SetPiece = {
  readonly reward: Wearable;
  /** 0 for a Shark Pass Plus extra. */
  readonly step: number;
  readonly row: 'free' | 'pass' | 'plus';
  readonly owned: boolean;
};

/**
 * The season set: every wearable this season (pins and scenes), free row first, then the Shark
 * Pass row by step, then Plus. Owned = claimed (Plus extras: owned with Plus). Exported for tests.
 */
export function seasonSet(tiers: readonly SharkPassTier[], plusRewards: readonly SharkPassReward[] = [], plus = false): { pieces: SetPiece[]; owned: number } {
  const free: SetPiece[] = [];
  const pass: SetPiece[] = [];
  for (const t of tiers) {
    if (isWearable(t.free)) free.push({ reward: t.free, step: t.tier, row: 'free', owned: t.free_claimed });
    if (isWearable(t.paid)) pass.push({ reward: t.paid, step: t.tier, row: 'pass', owned: t.paid_claimed });
  }
  const extras: SetPiece[] = plusRewards.flatMap(r => (isWearable(r) ? [{ reward: r, step: 0, row: 'plus' as const, owned: plus }] : []));
  const pieces = [...free, ...pass, ...extras];
  return { pieces, owned: pieces.filter(p => p.owned).length };
}

/** Where a piece comes from, in plain words: "Free at step 10", "Shark Pass, step 20", "Shark Pass Plus". */
export function pieceSource(piece: SetPiece): string {
  if (piece.row === 'plus') return 'Shark Pass Plus';
  return piece.row === 'free' ? `Free at step ${piece.step}` : `Shark Pass, step ${piece.step}`;
}

/** What changed since the last look: points gained and whether a step was crossed. Exported for tests. */
export function passGain(prev: { season: string; points: number; tier: number } | null, state: SharkPassState | null): { gained: number; stepUp: number | null } | null {
  if (!prev || !state || !state.enabled || !state.season || !state.progress || prev.season !== state.season.key) return null;
  const gained = state.progress.points - prev.points;
  if (gained <= 0) return null;
  return { gained, stepUp: state.progress.tier > prev.tier ? state.progress.tier : null };
}


/** Where a wear-first reward card is: asking, saving the look, or done (worn, kept, or the save failed). */
export type WearChoice = null | 'saving' | 'worn' | 'kept' | 'failed';

/** How long "Putting it on..." may take before the card offers Try again (park Wi-Fi can hang). */
export const WEAR_TIMEOUT_MS = 8000;

/**
 * The buttons on a wear-first reward card. Bragging never costs the wear: Share shows only after
 * the choice, sits right under the yellow button, and the close word is always last.
 * Pure, so the order is unit tested.
 */
export function wearFirstButtons(chosen: WearChoice): {
  readonly action: 'wear' | 'retry' | null;
  readonly busy: boolean;
  readonly share: boolean;
  /** The close word, and whether tapping it is the "keep my look" choice. */
  readonly doneLabel: string;
  readonly doneKeeps: boolean;
} {
  switch (chosen) {
    // "Not now" on every reveal (box, Shark Pass, Set Complete): "Keep my ..." read as "keep it on".
    case null: return { action: 'wear', busy: false, share: false, doneLabel: 'Not now', doneKeeps: true };
    case 'saving': return { action: null, busy: true, share: false, doneLabel: 'Done', doneKeeps: false };
    case 'failed': return { action: 'retry', busy: false, share: true, doneLabel: 'Done', doneKeeps: false };
    default: return { action: null, busy: false, share: true, doneLabel: 'Done', doneKeeps: false };
  }
}

/** The line under the title for each step of the wear-first card. */
export function wearFirstCaption(chosen: WearChoice, opening: string, frame: boolean): string {
  switch (chosen) {
    // Saving: the button says "Putting it on...", so the line keeps the reward's name (no echo).
    case 'worn': return frame ? 'Your frame shows on your profile now.' : 'Your shark is wearing it now!';
    case 'kept': return 'It’s in your closet whenever you want it.';
    case 'failed': return 'That didn’t work. Tap Try again.';
    default: return opening;
  }
}

/** How long the card waits for the fresh look after a wear saved, before it shows "worn" anyway. */
export const WEAR_REFRESH_MS = 4000;

/**
 * Put it on, then fetch the fresh look. Only the save can fail: it times out after wearMs. The
 * refresh is raced against refreshMs and never turns a wear that saved into "That didn't work".
 * A save that lands after the timeout calls onLateWorn (after a refresh try), so the card can
 * switch from Try again to worn: the screen never says "failed" for a wear that saved.
 */
export async function wearThenRefresh(save: () => Promise<unknown>, refresh?: (() => unknown) | null,
  wearMs = WEAR_TIMEOUT_MS, refreshMs = WEAR_REFRESH_MS, onLateWorn?: () => void): Promise<'worn' | 'failed'> {
  const settle = async () => {
    if (!refresh) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([
      Promise.resolve().then(refresh).catch(() => undefined),
      new Promise<void>(r => { t = setTimeout(r, refreshMs); }),
    ]);
    if (t) clearTimeout(t);
  };
  try {
    await withWearTimeout(Promise.resolve().then(save), wearMs,
      onLateWorn ? () => { void settle().then(onLateWorn); } : undefined);
  } catch { return 'failed'; }
  await settle();
  return 'worn';
}

/**
 * A wear call that hangs (park Wi-Fi) fails after WEAR_TIMEOUT_MS instead of spinning forever.
 * If the call then finishes after all, onLate gets its value (the save went through late).
 */
export function withWearTimeout<T>(run: Promise<T>, ms = WEAR_TIMEOUT_MS, onLate?: (value: T) => void): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let timedOut = false;
    const t = setTimeout(() => { timedOut = true; reject(new Error('wear timed out')); }, ms);
    run.then(v => {
      clearTimeout(t);
      if (timedOut) onLate?.(v); else resolve(v);
    }, e => { clearTimeout(t); reject(e); });
  });
}
