/**
 * "A coin game is open at this coin" (PLAY! started it, or it just closed), told by the task attempt calls
 * and kept by the ride question ledger, so ride detection never counts the time spent playing a ride's coin
 * game as its line. Tiny on purpose: the API layer imports it without pulling in storage.
 */
type Sink = (taskId: number, at: number) => void;

let sink: Sink | null = null;
let early: { taskId: number; at: number }[] = [];

export function noteCoinGame(taskId: number, at = Date.now()): void {
  if (!Number.isInteger(taskId) || taskId <= 0 || !Number.isFinite(at)) return;
  if (sink) sink(taskId, at);
  else early = [...early.slice(-19), { taskId, at }];
}

/** The ledger takes the notes (and any that came before it loaded). */
export function setCoinGameSink(next: Sink | null): void {
  sink = next;
  if (!next) return;
  const pending = early;
  early = [];
  for (const note of pending) next(note.taskId, note.at);
}
