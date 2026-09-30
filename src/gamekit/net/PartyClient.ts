/**
 * PartyClient: the Line Party connection for one phone.
 *
 * Transport: HTTPS for everything that matters (play, ready, emote, submit)
 * and Laravel Reverb (Pusher protocol) for pushes plus 4 Hz display whispers.
 * No gameplay depends on the socket. When it is down the client polls the same
 * room snapshot over HTTP, and every snapshot is version-gated, so a reconnect
 * storm on park LTE can never move the room backwards.
 *
 * The line is always moving: nothing here pauses a round. If this phone is
 * backgrounded, pocketed or locked mid-round it hands its seat to its ghost
 * (partial submit) and the rest of the room plays on. The player is back for
 * the next round. A round that starts while this phone is late (slow network,
 * just unlocked) still gets its full length: boards are parallel, the server
 * replays each log against the shared seed, so a synced GO is presentation only.
 */
import { buildTimeline, resolve, BONK_RACE_VERSION, type Spawn, type Tap } from '../../games/party/bonkRace';
import { ClockSync } from './ClockSync';
import type { EmoteEvent, EmoteId, EntryResponse, PartyApiError, ProgressWhisper, RoomSnapshot, RoundSummary } from './partyTypes';
import {
  applyEmote,
  applyProgress,
  applyRound,
  applySnapshot,
  initialPartyState,
  type Connection,
  type PartyPhase,
  type PartyState,
} from './roomState';

export interface HttpLike {
  get<T = any>(url: string, config?: any): Promise<{ data: T }>;
  post<T = any>(url: string, body?: any, config?: any): Promise<{ data: T }>;
}

export interface ChannelLike {
  bind(event: string, cb: (data: any) => void): unknown;
  unbind(event?: string, cb?: (data: any) => void): unknown;
  trigger(event: string, data: any): boolean;
}

export interface SocketLike {
  connection: {
    state: string;
    bind(event: string, cb: (data: any) => void): unknown;
    unbind(event?: string, cb?: (data: any) => void): unknown;
  };
  subscribe(name: string): ChannelLike;
  unsubscribe(name: string): void;
  connect(): void;
  disconnect(): void;
}

export type Authorize = (socketId: string, channelName: string) => Promise<{ auth: string; channel_data?: string }>;

export interface StorageLike {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface AppStateLike {
  addEventListener(event: 'change', cb: (state: string) => void): { remove(): void };
}

export interface PartyClientOptions {
  http: HttpLike;
  userId: number;
  /** Build a Pusher-protocol socket; omit (or return null) for HTTP polling only. */
  createSocket?: (authorize: Authorize) => SocketLike | null;
  storage?: StorageLike;
  appState?: AppStateLike;
  now?: () => number;
  perfNow?: () => number;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
  log?: (message: string, data?: unknown) => void;
}

export interface LocalRound {
  roundId: string;
  roundNo: number;
  seed: number;
  spawns: Spawn[];
  durationMs: number;
  /** Monotonic ms (perfNow) of this board's GO. */
  goAt: number;
  /** True when this phone arrived late and started its own GO on arrival. */
  lateStart: boolean;
  taps: Tap[];
  ended: boolean;
  submitted: boolean;
}

export const HEARTBEAT_MS = 10000;
export const POLL_LIVE_MS = 5000;
export const POLL_FALLBACK_MS = 1000;
export const WHISPER_MS = 250;
/** A board may start at most this late and still play a full round. */
export const MAX_LATE_START_MS = 12000;
/** Minimum on-screen count-in when a round arrives late. */
export const LATE_COUNT_IN_MS = 900;

const PENDING_KEY = 'party:pending-submit';

export class PartyClient {
  private state: PartyState;
  private listeners = new Set<(s: PartyState) => void>();
  readonly clock: ClockSync;
  private socket: SocketLike | null = null;
  private roomChannel: ChannelLike | null = null;
  private channelName: string | null = null;
  private loopTimers: unknown[] = [];
  private roundTimers: unknown[] = [];
  private wakeTimers: unknown[] = [];
  private local: LocalRound | null = null;
  private lastWhisperAt = 0;
  private appStateSub: { remove(): void } | null = null;
  private destroyed = false;
  private readonly now: () => number;
  private readonly perfNow: () => number;
  private readonly setTimer: (fn: () => void, ms: number) => unknown;
  private readonly clearTimer: (h: unknown) => void;
  private readonly log: (m: string, d?: unknown) => void;

  constructor(private readonly opts: PartyClientOptions) {
    this.state = initialPartyState(opts.userId);
    this.now = opts.now ?? (() => Date.now());
    this.perfNow = opts.perfNow ?? (() => (globalThis.performance?.now ? globalThis.performance.now() : Date.now()));
    this.setTimer = opts.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
    this.clearTimer = opts.clearTimer ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
    this.log = opts.log ?? (() => {});
    this.clock = new ClockSync(
      async () => (await this.opts.http.get<{ server_ms: number }>('/party/time')).data.server_ms,
      this.now,
      (ms) => new Promise((done) => this.setTimer(() => done(), ms)),
    );
    this.appStateSub = opts.appState?.addEventListener('change', (s) => this.onAppState(s)) ?? null;
  }

  // ---------------------------------------------------------------- store

  getState = (): PartyState => this.state;

  subscribe = (listener: (s: PartyState) => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private set(next: PartyState): void {
    if (this.destroyed) return;
    const phase = this.derivePhase(next);
    this.state = phase === next.phase ? next : { ...next, phase };
    this.listeners.forEach((l) => l(this.state));
  }

  get round(): LocalRound | null {
    return this.local;
  }

  // ---------------------------------------------------------------- lifecycle

  async join(rideId: number): Promise<void> {
    this.set({ ...this.state, phase: 'joining', error: null, leftReason: null });
    try {
      await this.clock.sync(5, 120);
      this.set({ ...this.state, clockOffsetMs: this.clock.offsetMs });
      await this.flushPendingSubmit();
      const { data } = await this.opts.http.post<{ room: RoomSnapshot }>('/party/play', { ride_id: rideId });
      this.applyRoom(data.room);
      this.connectSocket();
      this.startLoops();
    } catch (e) {
      const err = this.toError(e);
      this.set({ ...this.state, phase: 'error', error: { code: err.code, message: err.message } });
    }
  }

  async ready(ready = true): Promise<void> {
    await this.roomCall('ready', { ready });
  }

  async rematch(): Promise<void> {
    await this.roomCall('rematch', { ready: true });
  }

  async start(): Promise<void> {
    await this.roomCall('start');
  }

  async emote(emote: EmoteId): Promise<boolean> {
    const room = this.state.room;
    if (!room) return false;
    // Optimistic: your own sticker pops on the same frame as the tap.
    const mine: EmoteEvent = { user_id: this.opts.userId, emote, at_ms: Math.round(this.clock.serverNow()) };
    this.set(applyEmote(this.state, mine, this.now()));
    try {
      await this.opts.http.post(`/party/rooms/${room.id}/emote`, { emote });
      return true;
    } catch {
      return false;
    }
  }

  async leave(): Promise<void> {
    const room = this.state.room;
    if (this.local && !this.local.ended) await this.handToGhost();
    if (room) {
      try {
        await this.opts.http.post(`/party/rooms/${room.id}/leave`);
      } catch {
        // Leaving is best effort; the server moves a silent member on anyway.
      }
    }
    this.teardown();
    this.set({ ...this.state, leftReason: 'left' });
  }

  destroy(): void {
    this.teardown();
    this.appStateSub?.remove();
    this.appStateSub = null;
    this.destroyed = true;
    this.listeners.clear();
  }

  // ---------------------------------------------------------------- the round

  /** Record a touch-down on a hole. Returns ms since this board's GO, or null outside play. */
  recordTap(hole: number): number | null {
    const r = this.local;
    if (!r || r.ended || this.state.phase !== 'playing') return null;
    const t = Math.round(this.perfNow() - r.goAt);
    if (t < 0 || t > r.durationMs) return null;
    const last = r.taps.length ? r.taps[r.taps.length - 1][0] : 0;
    r.taps.push([Math.max(t, last), hole]);
    return t;
  }

  /** Board time in ms since GO (negative during the count-in). */
  boardTime(): number | null {
    return this.local ? this.perfNow() - this.local.goAt : null;
  }

  /** Whisper my live score to the room at 4 Hz (display only). */
  reportProgress(score: number, streak: number): void {
    const r = this.local;
    const channel = this.roomChannel;
    if (!r || !channel || this.state.connection !== 'live') return;
    const at = this.now();
    if (at - this.lastWhisperAt < WHISPER_MS) return;
    this.lastWhisperAt = at;
    const w: ProgressWhisper = { u: this.opts.userId, s: score, k: streak, t: Math.round(this.perfNow() - r.goAt), r: r.roundNo };
    try {
      channel.trigger('client-progress', w);
    } catch {
      // Whispers are best effort.
    }
  }

  // ---------------------------------------------------------------- internals

  private async roomCall(action: string, body?: any): Promise<void> {
    const room = this.state.room;
    if (!room) return;
    try {
      const { data } = await this.opts.http.post<{ room: RoomSnapshot }>(`/party/rooms/${room.id}/${action}`, body);
      this.applyRoom(data.room);
    } catch (e) {
      this.handleError(e);
    }
  }

  private applyRoom(room: RoomSnapshot): void {
    if (this.channelName && this.channelName !== `presence-party.${room.id}`) this.unsubscribeRoom();
    const before = this.state.room;
    this.set(applySnapshot(this.state, room));
    if (this.socket && !this.roomChannel) this.subscribeRoom(room.id);
    if (!before || before.version !== this.state.room?.version || before.id !== room.id) this.scheduleWakeups(this.state.room!);
    this.syncRound();
  }

  private applyRoundPush(round: RoundSummary): void {
    this.set(applyRound(this.state, round));
    if (this.state.room) this.scheduleWakeups(this.state.room);
    this.syncRound();
  }

  /** Line the local board up with the server's current round. */
  private syncRound(): void {
    const room = this.state.room;
    const round = room?.round;
    if (!room || !round) return;

    const mine = round.seats.find((s) => s.kind === 'human' && s.user_id === this.opts.userId);
    if (round.status === 'scheduled' && mine && this.local?.roundId !== round.id) {
      const nowWall = this.now();
      const nowPerf = this.perfNow();
      const goWall = this.clock.toLocal(round.start_at_ms);
      let goAt = nowPerf + (goWall - nowWall);
      let lateStart = false;
      const late = nowPerf - goAt;
      const alreadyIn = room.you?.round_id === round.id && room.you.submitted;
      if (late > MAX_LATE_START_MS || alreadyIn) {
        // Too late to play fairly inside the submit window: the ghost takes this one.
        this.local = { roundId: round.id, roundNo: round.round_no, seed: round.seed, spawns: [], durationMs: round.duration_ms, goAt, lateStart: true, taps: [], ended: true, submitted: alreadyIn };
        if (!alreadyIn) void this.submit(true, 0);
        this.set({ ...this.state, ghostedRoundId: round.id });
        return;
      }
      if (late > -LATE_COUNT_IN_MS) {
        goAt = nowPerf + LATE_COUNT_IN_MS;
        lateStart = late > 0;
      }
      this.local = {
        roundId: round.id, roundNo: round.round_no, seed: round.seed, spawns: buildTimeline(round.seed),
        durationMs: round.duration_ms, goAt, lateStart, taps: [], ended: false, submitted: false,
      };
      this.log('round scheduled', { round: round.round_no, inMs: Math.round(goAt - nowPerf), lateStart });
      this.scheduleRoundTimers();
    }
    if (round.status === 'finalized' && this.local?.roundId === round.id && !this.local.ended) {
      // The server closed the round (window over) before this board finished.
      this.local.ended = true;
    }
    this.set({ ...this.state });
  }

  private scheduleRoundTimers(): void {
    this.roundTimers.forEach((t) => this.clearTimer(t));
    this.roundTimers = [];
    const r = this.local;
    if (!r) return;
    const nowPerf = this.perfNow();
    this.roundTimers.push(this.setTimer(() => this.set({ ...this.state }), Math.max(0, r.goAt - nowPerf)));
    this.roundTimers.push(this.setTimer(() => void this.finishRound(), Math.max(0, r.goAt + r.durationMs - nowPerf + 60)));
  }

  private async finishRound(): Promise<void> {
    const r = this.local;
    if (!r || r.ended) return;
    r.ended = true;
    this.set({ ...this.state });
    await this.submit(false, r.durationMs);
  }

  /** Backgrounded or leaving mid-round: my taps so far, then my ghost. */
  private async handToGhost(): Promise<void> {
    const r = this.local;
    if (!r || r.ended) return;
    r.ended = true;
    const until = Math.max(0, Math.min(r.durationMs, Math.round(this.perfNow() - r.goAt)));
    this.set({ ...this.state, ghostedRoundId: r.roundId });
    await this.submit(true, until);
  }

  private async submit(partial: boolean, untilMs: number): Promise<void> {
    const r = this.local;
    if (!r || r.submitted) return;
    const taps = partial ? r.taps.filter(([t]) => t < untilMs) : r.taps;
    const body = {
      taps,
      partial,
      ...(partial ? { until_ms: untilMs } : {}),
      client_score: partial ? null : resolve(r.spawns.length ? r.spawns : buildTimeline(r.seed), taps).score,
      sim_version: BONK_RACE_VERSION,
    };
    await this.opts.storage?.setItem(PENDING_KEY, JSON.stringify({ roundId: r.roundId, body, at: this.now() })).catch(() => {});
    for (let attempt = 0; attempt < 6 && !this.destroyed; attempt++) {
      try {
        const { data } = await this.opts.http.post<EntryResponse>(`/party/rounds/${r.roundId}/submit`, body);
        r.submitted = true;
        await this.opts.storage?.removeItem(PENDING_KEY).catch(() => {});
        this.set({
          ...applySnapshot(this.state, data.room),
          entry: { roundId: r.roundId, verifiedScore: data.entry.verified_score, verdict: data.entry.verdict, partial: data.entry.partial },
        });
        return;
      } catch (e) {
        const err = this.toError(e);
        if (err.status >= 400 && err.status < 500 && err.status !== 429 && err.status !== 408) {
          r.submitted = true;
          await this.opts.storage?.removeItem(PENDING_KEY).catch(() => {});
          this.log('submit refused', err);
          this.refresh();
          return;
        }
        await new Promise((res) => this.setTimer(() => res(null), 400 * 2 ** attempt));
      }
    }
  }

  /** A submit that was in flight when the app died is sent on the next join. */
  private async flushPendingSubmit(): Promise<void> {
    const raw = await this.opts.storage?.getItem(PENDING_KEY).catch(() => null);
    if (!raw) return;
    try {
      const pending = JSON.parse(raw);
      if (this.now() - pending.at < 60000) await this.opts.http.post(`/party/rounds/${pending.roundId}/submit`, pending.body);
    } catch {
      // Too late or already in; the server's ghost covered it.
    }
    await this.opts.storage?.removeItem(PENDING_KEY).catch(() => {});
  }

  private onAppState(next: string): void {
    // 'inactive' (Control Center, a notification banner, the app switcher peek)
    // keeps the board: the player is still holding the phone. Only a real
    // background (home, lock, pocket, call) hands the seat to the ghost, because
    // iOS may suspend JS any moment after that.
    if (next === 'inactive') return;
    if (next !== 'active') {
      if (this.local && !this.local.ended) void this.handToGhost();
      return;
    }
    if (this.state.room) {
      void this.clock.sync(3, 100).then(() => this.set({ ...this.state, clockOffsetMs: this.clock.offsetMs }));
      this.refresh();
      if (this.socket && this.socket.connection.state !== 'connected') this.socket.connect();
    }
  }

  refresh = (): void => {
    const room = this.state.room;
    if (!room || this.destroyed) return;
    this.opts.http.get<{ room: RoomSnapshot }>(`/party/rooms/${room.id}`)
      .then(({ data }) => this.applyRoom(data.room))
      .catch((e) => this.handleError(e));
  };

  private heartbeat = (): void => {
    const room = this.state.room;
    if (!room || this.destroyed) return;
    const liveScore = this.local && !this.local.ended && this.state.connection !== 'live'
      ? resolve(this.local.spawns, this.local.taps).score : undefined;
    this.opts.http.post<{ room: RoomSnapshot }>(`/party/rooms/${room.id}/heartbeat`, liveScore !== undefined ? { live_score: liveScore } : {})
      .then(({ data }) => this.applyRoom(data.room))
      .catch((e) => this.handleError(e));
  };

  private startLoops(): void {
    this.loopTimers.forEach((t) => this.clearTimer(t));
    this.loopTimers = [];
    const loop = (fn: () => void, ms: () => number) => {
      const tick = () => {
        if (this.destroyed || !this.state.room) return;
        fn();
        const h = this.setTimer(tick, ms());
        this.loopTimers.push(h);
        if (this.loopTimers.length > 16) this.loopTimers.splice(0, this.loopTimers.length - 16);
      };
      this.loopTimers.push(this.setTimer(tick, ms()));
    };
    loop(this.heartbeat, () => HEARTBEAT_MS);
    loop(this.pollIfNeeded, () => (this.state.connection === 'live' ? POLL_LIVE_MS : POLL_FALLBACK_MS));
  }

  /** Safety poll: every second without a socket, every five with one. */
  private pollIfNeeded = (): void => {
    if (this.state.room) this.refresh();
  };

  /**
   * The server advances rooms lazily on every request (plus a tick daemon), so
   * the phones wake it at the moments that matter: a lobby's autostart and a
   * round's close. Whoever asks first moves the room for everyone.
   */
  private scheduleWakeups(room: RoomSnapshot): void {
    this.wakeTimers.forEach((t) => this.clearTimer(t));
    this.wakeTimers = [];
    const at = (serverMs: number | null | undefined, extra: number) => {
      if (!serverMs) return;
      const delay = this.clock.toLocal(serverMs) - this.now() + extra;
      if (delay > -2000 && delay < 120000) this.wakeTimers.push(this.setTimer(this.refresh, Math.max(0, delay)));
    };
    if (room.status === 'lobby' || room.status === 'results') at(room.autostart_at_ms, 150);
    if (room.round && room.round.status === 'scheduled') at(room.round.end_at_ms, 1500);
  }

  private connectSocket(): void {
    if (this.socket || !this.opts.createSocket) {
      if (!this.opts.createSocket) this.set({ ...this.state, connection: 'polling' });
      return;
    }
    const authorize: Authorize = async (socketId, channelName) =>
      (await this.opts.http.post('/broadcasting/auth', { socket_id: socketId, channel_name: channelName })).data;
    const socket = this.opts.createSocket(authorize);
    if (!socket) {
      this.set({ ...this.state, connection: 'polling' });
      return;
    }
    this.socket = socket;
    this.set({ ...this.state, connection: 'connecting' });
    socket.connection.bind('state_change', ({ current }: { current: string }) => {
      const connection: Connection = current === 'connected' ? 'live' : current === 'connecting' || current === 'initialized' ? 'connecting' : 'polling';
      const wasLive = this.state.connection === 'live';
      this.set({ ...this.state, connection });
      // Missed pushes while the socket was down are recovered from one snapshot.
      if (connection === 'live' && !wasLive) this.refresh();
    });
    if (this.state.room) this.subscribeRoom(this.state.room.id);
  }

  private subscribeRoom(roomId: string): void {
    if (!this.socket) return;
    const name = `presence-party.${roomId}`;
    const channel = this.socket.subscribe(name);
    this.roomChannel = channel;
    this.channelName = name;
    channel.bind('room.updated', (e: { room: RoomSnapshot }) => this.applyRoom(e.room));
    channel.bind('round.scheduled', (e: { round: RoundSummary }) => this.applyRoundPush(e.round));
    channel.bind('round.finalized', (e: { round: RoundSummary }) => this.applyRoundPush(e.round));
    channel.bind('round.entry', (e: { user_id: number; partial: boolean; verified_score: number | null }) => {
      if (e.user_id === this.opts.userId || !e.partial) return;
      const prev = this.state.rivals[e.user_id];
      const round = this.state.room?.round?.round_no ?? 0;
      this.set({ ...this.state, rivals: { ...this.state.rivals, [e.user_id]: { score: prev?.score ?? e.verified_score ?? 0, streak: 0, t: prev?.t ?? 0, round, receivedAt: this.now(), ghost: true } } });
    });
    channel.bind('emote', (e: EmoteEvent) => this.set(applyEmote(this.state, e, this.now())));
    channel.bind('client-progress', (w: ProgressWhisper) => this.set(applyProgress(this.state, w, this.now())));
    channel.bind('pusher:subscription_error', (e: unknown) => this.log('room channel refused', e));
  }

  private unsubscribeRoom(): void {
    if (this.socket && this.channelName) this.socket.unsubscribe(this.channelName);
    this.roomChannel = null;
    this.channelName = null;
  }

  private teardown(): void {
    this.loopTimers.forEach((t) => this.clearTimer(t));
    this.roundTimers.forEach((t) => this.clearTimer(t));
    this.wakeTimers.forEach((t) => this.clearTimer(t));
    this.loopTimers = [];
    this.roundTimers = [];
    this.wakeTimers = [];
    this.unsubscribeRoom();
    this.socket?.disconnect();
    this.socket = null;
  }

  private handleError(e: unknown): void {
    const err = this.toError(e);
    if (err.code === 'LEFT_QUEUE') {
      // Left the geofence or boarded: wrap up. The ghost already has the seat.
      if (err.room) this.set(applySnapshot(this.state, err.room));
      if (this.local) this.local.ended = true;
      this.teardown();
      this.set({ ...this.state, leftReason: 'left_queue' });
      return;
    }
    if (err.code === 'ROOM_NOT_FOUND') {
      this.teardown();
      this.set({ ...this.state, leftReason: 'closed' });
      return;
    }
    this.log('party request failed', err);
  }

  private toError(e: any): PartyApiError {
    const status = e?.response?.status ?? 0;
    const data = e?.response?.data ?? {};
    return { status, code: data.code ?? (status ? `HTTP_${status}` : 'NETWORK'), message: data.message ?? 'Connection trouble. Retrying.', room: data.room };
  }

  private derivePhase(s: PartyState): PartyPhase {
    if (s.leftReason) return 'left';
    const room = s.room;
    if (!room) return s.phase === 'error' || s.phase === 'joining' ? s.phase : 'idle';
    if (room.status === 'closed') return 'left';
    if (room.status === 'lobby') return 'lobby';
    if (room.status === 'results') return 'results';
    const round = room.round;
    if (!round) return 'lobby';
    const mine = round.seats.some((seat) => seat.kind === 'human' && seat.user_id === this.opts.userId);
    if (!mine) return 'spectating';
    if (s.ghostedRoundId === round.id) return 'ghosting';
    const r = this.local;
    if (!r || r.roundId !== round.id) return 'countdown';
    if (!r.ended) return this.perfNow() < r.goAt ? 'countdown' : 'playing';
    return r.submitted ? 'waiting' : 'submitting';
  }
}
