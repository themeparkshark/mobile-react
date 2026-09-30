/**
 * Sprint Race transport (design 10.1 / 10.4).
 *
 * One interface, two wires:
 *   - LabRaceTransport: a plain WebSocket to tools/sharky/lab-race-server.cjs
 *     (dev lab, two simulators). Same room/round/results semantics as Line
 *     Party, so the UI and the sim path are identical.
 *   - Production: Line Party (Laravel + Reverb) once the backend registers the
 *     'sharky_race' game (change request in studio/sharky/NOTES.md). The
 *     PartyClient game adapter plugs in behind this same interface.
 *
 * Nothing here pauses anyone: whispers are display-only (10 Hz), results come
 * only from server replays, and a player who backgrounds is ghost-filled.
 */

export type RacePhase = 'connecting' | 'lobby' | 'countdown' | 'racing' | 'results' | 'offline';

export interface RaceMember {
  id: number;
  name: string;
  ready: boolean;
  state: 'active' | 'away';
}

export interface RaceSeat {
  seat: number;
  kind: 'human' | 'bot';
  name: string;
  userId?: number;
  profile?: string;
  /** Bots: the planned input log (encoded), identical on every phone. */
  inputs?: string;
}

export interface RaceRound {
  roundId: string;
  roundNo: number;
  seed: number;
  /** Server clock ms of GO. */
  startAtMs: number;
  seats: RaceSeat[];
  you: number;
}

export interface RaceResult {
  seat: number;
  kind: 'human' | 'bot';
  name: string;
  userId?: number;
  finished: boolean;
  finishStep: number;
  score: number;
  placement: number;
  points: number;
  verified: boolean;
  reason: string;
  filledBy: 'ghost' | null;
}

export interface RaceWhisper {
  seat: number;
  step: number;
  /** Distance (u) and y (u). */
  d: number;
  y: number;
  f: number;
}

export interface RaceState {
  phase: RacePhase;
  userId: number | null;
  members: RaceMember[];
  autostartAtMs: number;
  round: RaceRound | null;
  results: RaceResult[] | null;
  nextLobbyAtMs: number;
  /** serverMs - localMs (min-RTT estimate). */
  offsetMs: number;
  rttMs: number;
  entryVerdict: string | null;
}

export interface RaceTransport {
  readonly state: RaceState;
  subscribe(cb: (s: RaceState) => void): () => void;
  onWhisper(cb: (w: RaceWhisper) => void): () => void;
  join(rideId: number, name: string): void;
  ready(): void;
  whisper(step: number, d: number, y: number, f: number): void;
  submit(roundId: string, proof: unknown): void;
  background(on: boolean): void;
  emote(id: string): void;
  /** Local ms for a server timestamp. */
  toLocal(serverMs: number): number;
  close(): void;
}

export const INITIAL_RACE_STATE: RaceState = {
  phase: 'connecting',
  userId: null,
  members: [],
  autostartAtMs: 0,
  round: null,
  results: null,
  nextLobbyAtMs: 0,
  offsetMs: 0,
  rttMs: 0,
  entryVerdict: null,
};

/** Min-RTT clock offset from ping samples (pure; tested). */
export function bestOffset(samples: Array<{ c0: number; s: number; c1: number }>): { offsetMs: number; rttMs: number } {
  let best: { offsetMs: number; rttMs: number } = { offsetMs: 0, rttMs: Infinity };
  for (const x of samples) {
    const rtt = x.c1 - x.c0;
    if (rtt < 0) continue;
    if (rtt < best.rttMs) best = { offsetMs: x.s - (x.c0 + x.c1) / 2, rttMs: rtt };
  }
  return best.rttMs === Infinity ? { offsetMs: 0, rttMs: 0 } : best;
}

interface WsLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((e: unknown) => void) | null;
}

export class LabRaceTransport implements RaceTransport {
  state: RaceState = { ...INITIAL_RACE_STATE };
  private ws: WsLike | null = null;
  private subs = new Set<(s: RaceState) => void>();
  private wsubs = new Set<(w: RaceWhisper) => void>();
  private pings: Array<{ c0: number; s: number; c1: number }> = [];
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private hello: { rideId: number; name: string } | null = null;

  constructor(private readonly url: string, private readonly makeSocket: (url: string) => WsLike = (u) => new WebSocket(u) as unknown as WsLike,
    private readonly nowFn: () => number = () => Date.now()) {}

  subscribe(cb: (s: RaceState) => void): () => void {
    this.subs.add(cb);
    cb(this.state);
    return () => this.subs.delete(cb);
  }

  onWhisper(cb: (w: RaceWhisper) => void): () => void {
    this.wsubs.add(cb);
    return () => this.wsubs.delete(cb);
  }

  private set(patch: Partial<RaceState>): void {
    this.state = { ...this.state, ...patch };
    this.subs.forEach((cb) => cb(this.state));
  }

  private send(msg: unknown): void {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(msg));
  }

  join(rideId: number, name: string): void {
    this.hello = { rideId, name };
    this.connect();
  }

  private connect(): void {
    if (this.closed) return;
    const ws = this.makeSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.hello) this.send({ t: 'hello', rideId: this.hello.rideId, name: this.hello.name });
      this.pings = [];
      for (let i = 0; i < 5; i++) setTimeout(() => this.send({ t: 'ping', c: this.nowFn() }), i * 120);
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping', c: this.nowFn() }), 5000);
    };
    ws.onmessage = (e) => this.handle(String(e.data));
    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.closed) return;
      this.set({ phase: 'offline' });
      setTimeout(() => this.connect(), 1500);
    };
    ws.onerror = () => undefined;
  }

  handle(raw: string): void {
    let m: any;
    try {
      m = JSON.parse(raw);
    } catch {
      return;
    }
    switch (m.t) {
      case 'pong': {
        this.pings.push({ c0: m.c, s: m.s, c1: this.nowFn() });
        if (this.pings.length > 12) this.pings.shift();
        const o = bestOffset(this.pings);
        this.set({ offsetMs: o.offsetMs, rttMs: o.rttMs });
        break;
      }
      case 'welcome':
        this.set({ userId: m.you });
        break;
      case 'room':
        this.set({
          members: m.members,
          autostartAtMs: m.autostartAtMs,
          phase: m.phase === 'lobby' ? 'lobby' : m.phase === 'results' ? 'results' : this.state.round ? (m.phase === 'racing' ? 'racing' : 'countdown') : 'lobby',
          ...(m.phase === 'lobby' ? { round: null, results: null, entryVerdict: null } : {}),
        });
        break;
      case 'round':
        this.set({
          phase: 'countdown',
          results: null,
          entryVerdict: null,
          round: { roundId: m.roundId, roundNo: m.roundNo, seed: m.seed, startAtMs: m.startAtMs, seats: m.seats, you: m.you },
        });
        break;
      case 'w':
        this.wsubs.forEach((cb) => cb({ seat: m.seat, step: m.step, d: m.d, y: m.y, f: m.f }));
        break;
      case 'entry':
        this.set({ entryVerdict: m.verdict });
        break;
      case 'results':
        this.set({ phase: 'results', results: m.results, nextLobbyAtMs: m.nextLobbyAtMs });
        break;
      default:
        break;
    }
  }

  ready(): void {
    this.send({ t: 'ready' });
  }

  whisper(step: number, d: number, y: number, f: number): void {
    this.send({ t: 'w', step, d, y, f });
  }

  submit(roundId: string, proof: unknown): void {
    this.send({ t: 'submit', roundId, proof });
  }

  background(on: boolean): void {
    this.send({ t: 'bg', on });
  }

  emote(id: string): void {
    this.send({ t: 'emote', id });
  }

  toLocal(serverMs: number): number {
    return serverMs - this.state.offsetMs;
  }

  close(): void {
    this.closed = true;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }
}
