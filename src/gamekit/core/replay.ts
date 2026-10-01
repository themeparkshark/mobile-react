/**
 * replay.ts: input logs, compact encoding, and ghost playback.
 *
 * Deterministic games record (step, kind, a, b) tuples against the fixed-step
 * sim clock. The log is the proof the server replays (TaskGameProofService),
 * the ghost other players race against, and the stand-in that finishes a
 * multiplayer round for a player who dropped or backgrounded.
 *
 * Preallocated (no per-input allocation), worklet-safe, and encodable to a
 * compact base-36 string for proof meta.
 */

export interface InputLog {
  cap: number;
  length: number;
  step: number[];
  kind: number[];
  a: number[];
  b: number[];
  /** Set when inputs were dropped because the log was full. */
  overflow: boolean;
}

export function createInputLog(cap = 4096): InputLog {
  'worklet';
  const step: number[] = [];
  const kind: number[] = [];
  const a: number[] = [];
  const b: number[] = [];
  for (let i = 0; i < cap; i++) {
    step.push(0);
    kind.push(0);
    a.push(0);
    b.push(0);
  }
  return { cap, length: 0, step, kind, a, b, overflow: false };
}

/** Record one input. a/b are small integers (lane, x/y in grid units, ms). */
export function logInput(log: InputLog, step: number, kind: number, a = 0, b = 0): boolean {
  'worklet';
  if (log.length >= log.cap) {
    log.overflow = true;
    return false;
  }
  const i = log.length;
  log.step[i] = step | 0;
  log.kind[i] = kind | 0;
  log.a[i] = a | 0;
  log.b[i] = b | 0;
  log.length += 1;
  return true;
}

export function clearInputLog(log: InputLog): void {
  'worklet';
  log.length = 0;
  log.overflow = false;
}

export interface InputEntry {
  step: number;
  kind: number;
  a: number;
  b: number;
}

export function logEntries(log: InputLog): InputEntry[] {
  const out: InputEntry[] = [];
  for (let i = 0; i < log.length; i++) out.push({ step: log.step[i], kind: log.kind[i], a: log.a[i], b: log.b[i] });
  return out;
}

/** Zigzag so negatives stay short. */
function zz(n: number): number {
  return n >= 0 ? n * 2 : -n * 2 - 1;
}

function unzz(n: number): number {
  return n % 2 === 0 ? n / 2 : -(n + 1) / 2;
}

/**
 * Encode as "v1:" + entries joined by ";", each "dstep.kind.a.b" in base 36
 * with the step delta-coded. About 6-9 chars per input.
 */
export function encodeInputLog(log: InputLog | InputEntry[]): string {
  const entries = Array.isArray(log) ? log : logEntries(log);
  let prev = 0;
  const parts: string[] = [];
  for (const e of entries) {
    const d = e.step - prev;
    prev = e.step;
    parts.push([zz(d), e.kind, zz(e.a), zz(e.b)].map((n) => n.toString(36)).join('.'));
  }
  return 'v1:' + parts.join(';');
}

export function decodeInputLog(text: string): InputEntry[] {
  if (!text.startsWith('v1:')) throw new Error('replay: unknown log version');
  const body = text.slice(3);
  if (!body) return [];
  let step = 0;
  return body.split(';').map((chunk) => {
    const [d, k, a, b] = chunk.split('.').map((s) => parseInt(s, 36));
    step += unzz(d);
    return { step, kind: k, a: unzz(a), b: unzz(b) };
  });
}

// =============================================================================
// Ghost playback
// =============================================================================

/**
 * Cursor over a recorded input list. Call ghostDue(g, step) every sim step;
 * it returns how many entries are due and advances `next`, so the caller
 * reads entries[next - due .. next - 1]. Used for async ghosts and to keep a
 * dropped player's slot playing in a live round.
 */
export interface GhostCursor {
  entries: InputEntry[];
  next: number;
}

export function createGhost(entries: InputEntry[]): GhostCursor {
  'worklet';
  return { entries, next: 0 };
}

export function ghostDue(g: GhostCursor, step: number): number {
  'worklet';
  let due = 0;
  while (g.next < g.entries.length && g.entries[g.next].step <= step) {
    g.next += 1;
    due += 1;
  }
  return due;
}

export function ghostDone(g: GhostCursor): boolean {
  'worklet';
  return g.next >= g.entries.length;
}

/**
 * Sampled score/position track for ghost visuals (ghost puck, split chips).
 * Samples are (ms, value); valueAt interpolates linearly and holds the ends.
 */
export interface GhostTrack {
  t: number[];
  v: number[];
}

export function trackValueAt(track: GhostTrack, ms: number): number {
  'worklet';
  const n = track.t.length;
  if (n === 0) return 0;
  if (ms <= track.t[0]) return track.v[0];
  if (ms >= track.t[n - 1]) return track.v[n - 1];
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (track.t[mid] <= ms) lo = mid;
    else hi = mid;
  }
  const span = track.t[hi] - track.t[lo];
  const u = span > 0 ? (ms - track.t[lo]) / span : 0;
  return track.v[lo] + (track.v[hi] - track.v[lo]) * u;
}

/**
 * Deterministic replay harness: runs `step(state, inputs)` for `steps` fixed
 * steps feeding the logged inputs, returning the final state. Tests and the
 * server verifier use this to prove a run.
 */
export function replayRun<S>(
  initial: S,
  entries: InputEntry[],
  steps: number,
  step: (state: S, stepIndex: number, due: InputEntry[]) => void,
): S {
  let cursor = 0;
  const due: InputEntry[] = [];
  for (let i = 0; i < steps; i++) {
    due.length = 0;
    while (cursor < entries.length && entries[cursor].step <= i) {
      due.push(entries[cursor]);
      cursor += 1;
    }
    step(initial, i, due);
  }
  return initial;
}
