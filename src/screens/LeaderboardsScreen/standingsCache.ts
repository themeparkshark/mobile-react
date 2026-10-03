/**
 * The standings tabs keep their last board in module caches so tab switches are
 * instant. A won coin changes Park Coins and XP standings, so a win bumps this
 * generation and the next visit refetches instead of showing the board from
 * before the win (QA P2-6: "Nobody has earned coins at this park yet" right
 * after a win).
 */
let generation = 0;

export function markStandingsStale(): void {
  generation += 1;
}

export function standingsGeneration(): number {
  return generation;
}

/**
 * Sign-out and account switches end the Standings session: every cached
 * board (friends' photos included) is dropped before the next player sees
 * the screen. Kept here, dependency free, so AuthProvider can call it.
 */
let session = 0;

export function endStandingsSession(): void {
  session += 1;
  generation += 1;
}

export function standingsSession(): number {
  return session;
}

/**
 * The Standings note a ride win leaves ("Weekly goal: 8 rides! +25 XP"). The
 * resolve call parks it here; the win screen shows it the moment its coin
 * reveal ends, so it never talks over the catch. A note nobody shows within
 * 15 s (another win path) is shown then by its own fallback.
 */
export interface PendingWinNote { readonly text: string; readonly big: boolean }
let pendingNote: PendingWinNote | null = null;
let pendingTimer: ReturnType<typeof setTimeout> | null = null;

let held = false;

/** The win screen holds the note while it is open, so the fallback never fires over it. */
export function holdWinNotes(on: boolean): void {
  held = on;
}

export function parkWinNote(note: PendingWinNote, fallback: (note: PendingWinNote) => void): void {
  pendingNote = note;
  if (pendingTimer) clearTimeout(pendingTimer);
  const arm = () => {
    pendingTimer = setTimeout(() => {
      if (held && pendingNote) { arm(); return; }
      const left = takeWinNote();
      if (left) fallback(left);
    }, 15_000);
  };
  arm();
}

export function takeWinNote(): PendingWinNote | null {
  const note = pendingNote;
  pendingNote = null;
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
  return note;
}

/** Whether a note is waiting (the win screen reserves its slot, so nothing jumps when it lands). */
export function hasWinNote(): boolean {
  return pendingNote !== null;
}
