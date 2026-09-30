/**
 * localPartyHost (dev builds only): an in-process stand-in for the Line Party
 * server, so Whack Rush can be played and recorded inside the real LineParty
 * UI on one simulator with no backend. It speaks the same HTTP routes the
 * PartyClient calls (polling mode, no socket) and scores every seat with the
 * registered party sim, exactly like the server's sidecar:
 *
 *   /party/time, /party/play, /party/rooms/{id}[/ready|start|rematch|emote|leave|heartbeat],
 *   /party/rounds/{id}/submit
 *
 * Room: me plus three house crew bots (Captain Fin ace, Bubbles regular,
 * Chomps rookie). A 5-round Party Series of Whack Rush, placement points
 * 4/2/1/0 (the FINAL ROUND doubles), best 4 of 5, crown by points.
 *
 * Never used in release builds: the product always talks to the real server.
 */

import { partySim } from '../../../games-registry/partySims';
import type { HttpLike } from '../../../gamekit/net/PartyClient';
import type { RoomSnapshot, RoundSummary, Seat, SeatResult, SeriesStanding, SeriesSummary } from '../../../gamekit/net/partyTypes';

const ROOM_ID = '0c0c0c0c-0000-4000-8000-00000000c0de';
const LOBBY_MS = 5000;
const COUNT_IN_MS = 3500;
const RESULTS_MS = 9000;
const GRACE_MS = 3000;
const POINTS = [4, 2, 1, 0];
const BOTS: { name: string; avatar: string; profile: 'ace' | 'regular' | 'rookie' }[] = [
  { name: 'Captain Fin', avatar: 'bot:captain', profile: 'ace' },
  { name: 'Bubbles', avatar: 'bot:bubbles', profile: 'regular' },
  { name: 'Chomps', avatar: 'bot:chomps', profile: 'rookie' },
];

interface Submit { taps: [number, number][]; partial: boolean; until_ms?: number }

export interface LocalPartyHost {
  http: HttpLike;
  /** Snapshot for tests. */
  room: () => RoomSnapshot;
}

function mix(a: number, b: number): number {
  let h = (a ^ Math.imul(b, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function createLocalPartyHost(opts: { userId: number; name?: string; game?: string; now?: () => number; seed?: number; log?: (m: string, d?: unknown) => void }): LocalPartyHost {
  const now = opts.now ?? (() => Date.now());
  const game = opts.game ?? 'whack_rush';
  const me = opts.userId;
  const baseSeed = (opts.seed ?? 20260930) >>> 0;
  let version = 1;
  let status: RoomSnapshot['status'] = 'lobby';
  let autostartAt: number | null = null;
  let roundNo = 0;
  let round: RoundSummary | null = null;
  let submitted: Submit | null = null;
  let myVerified: { score: number; verdict: string } | null = null;
  let resultsUntil = 0;
  const standings = new Map<string, SeriesStanding>();

  const seats = (): Seat[] => [
    { seat: 0, kind: 'human', user_id: me, name: opts.name ?? 'You', avatar_url: null, team: 'blue' },
    ...BOTS.map((b, i) => ({ seat: i + 1, kind: 'bot' as const, name: b.name, avatar_url: b.avatar, team: null, profile: b.profile })),
  ];

  const keyOf = (s: Seat) => (s.kind === 'bot' ? `b:${s.name}` : `u:${s.user_id}`);
  const series = (): SeriesSummary | null => {
    if (!roundNo) return null;
    const rows = [...standings.values()].sort((a, b) => b.points - a.points || b.verified_total - a.verified_total);
    rows.forEach((r, i) => { r.rank = i + 1; });
    const played = round?.status === 'finalized' ? roundNo : roundNo - 1;
    const done = played >= 5;
    return {
      id: 'local-series', series_no: 1, rounds_total: 5, rounds_played: played, count_best: 4,
      status: done ? 'finished' : 'playing', standings: rows,
      crown_key: done ? rows[0]?.key ?? null : null,
      crown_user_id: done && rows[0]?.kind === 'human' ? rows[0].user_id : null,
    };
  };

  const schedule = () => {
    roundNo += 1;
    const seed = mix(baseSeed, roundNo);
    const sim = partySim(game);
    const start = now() + COUNT_IN_MS;
    const dur = sim?.roundMs ?? 20000;
    round = {
      id: `0c0c0c0c-0000-4000-8000-${String(roundNo).padStart(12, '0')}`, round_no: roundNo, series_round: roundNo, final: roundNo === 5,
      game, sim_version: sim?.version ?? 1, seed, start_at_ms: start, end_at_ms: start + dur, duration_ms: dur, status: 'scheduled',
      seats: seats(), results: null,
    };
    submitted = null;
    myVerified = null;
    status = 'countdown';
    version += 1;
  };

  const finalize = () => {
    const r = round;
    const sim = r ? partySim(r.game) : null;
    if (!r || !sim || r.status === 'finalized') return;
    const board = sim.build(r.seed);
    const scored = r.seats.map((s) => {
      let taps: [number, number][];
      let filled: 'ghost' | null = null;
      let from: number | null = null;
      let verdict = 'ok';
      if (s.kind === 'bot') {
        taps = sim.botTaps(board, r.seed, s.seat, s.profile ?? 'regular');
        verdict = 'bot';
      } else if (submitted && !submitted.partial && sim.validTaps(submitted.taps)) {
        taps = submitted.taps;
      } else {
        const until = submitted?.until_ms ?? 0;
        taps = sim.ghostFill(board, r.seed, s.seat, submitted?.taps ?? [], until, 'regular');
        filled = 'ghost';
        from = until;
        verdict = 'no_contest:hold';
      }
      const res = sim.resolve(board, taps);
      return { s, res, filled, from, verdict };
    });
    const order = [...scored].sort((a, b) => b.res.score - a.res.score);
    const results: SeatResult[] = scored.map(({ s, res, filled, from, verdict }) => {
      const placement = order.findIndex((o) => o.res.score === res.score) + 1;
      const pts = verdict.startsWith('no_contest') ? 0 : POINTS[placement - 1] * (r.final ? 2 : 1);
      return {
        ...s, score: res.score, placement, points: pts, filled_by: filled, filled_from_ms: from, verdict,
        stats: { hits: res.hits, quick: res.quick, goldens: res.goldens, maxStreak: res.maxStreak },
      };
    });
    results.forEach((x) => {
      const k = keyOf(x);
      const row = standings.get(k) ?? {
        key: k, kind: x.kind, user_id: x.user_id ?? null, name: x.name, avatar_url: x.avatar_url, team: x.team,
        rounds: [], no_contest: [], points: 0, verified_total: 0, dropped: null, rank: 0,
      };
      row.rounds.push(x.points);
      row.no_contest.push(x.verdict.startsWith('no_contest'));
      row.verified_total += x.score;
      const sorted = [...row.rounds].map((p) => p ?? 0).sort((a, b) => b - a);
      row.points = sorted.slice(0, 4).reduce((a, b) => a + b, 0);
      row.dropped = row.rounds.length === 5 ? row.rounds.indexOf(Math.min(...row.rounds.map((p) => p ?? 0))) : null;
      standings.set(k, row);
    });
    const mine = results.find((x) => x.kind === 'human');
    opts.log?.('replayed', { round: r.round_no, you: mine?.score, taps: submitted?.taps.length ?? 0, verdict: mine?.verdict });
    myVerified = mine ? { score: mine.score, verdict: mine.verdict } : null;
    round = { ...r, status: 'finalized', results };
    status = 'results';
    resultsUntil = now() + RESULTS_MS;
    version += 1;
  };

  const advance = () => {
    const t = now();
    if (status === 'lobby' && autostartAt !== null && t >= autostartAt) schedule();
    if (status === 'countdown' && round && t >= round.start_at_ms) { status = 'playing'; version += 1; }
    if (status === 'playing' && round && (submitted || t >= round.end_at_ms + GRACE_MS)) finalize();
    if (status === 'results' && t >= resultsUntil && roundNo < 5) schedule();
  };

  const snapshot = (): RoomSnapshot => {
    advance();
    return {
      id: ROOM_ID, ride_id: 194, kind: 'quick', status, game, capacity: 4, version, round_no: roundNo, host_user_id: me,
      autostart_at_ms: status === 'lobby' ? autostartAt : null, server_ms: now(),
      members: [{ id: me, name: opts.name ?? 'You', avatar_url: null, team: 'blue', state: 'active', ready: true, live_score: null }],
      round, series: series(),
      you: {
        user_id: me, round_id: round?.id ?? null, state: 'active', seat: round ? 0 : null, submitted: !!submitted,
        verified_score: myVerified?.score ?? null, verdict: myVerified?.verdict ?? null, round_token: round ? `local:${round.id}` : null,
        known: { [String(me)]: opts.name ?? 'You' },
      },
    };
  };

  const ok = <T,>(data: T) => Promise.resolve({ data });

  const http: HttpLike = {
    get: (<T,>(url: string) => {
      if (url === '/party/time') return ok({ server_ms: now() } as unknown as T);
      return ok({ room: snapshot() } as unknown as T);
    }) as HttpLike['get'],
    post: (<T,>(url: string, body?: unknown) => {
      if (url === '/party/play') {
        status = 'lobby';
        autostartAt = now() + LOBBY_MS;
        version += 1;
        return ok({ room: snapshot() } as unknown as T);
      }
      if (url.endsWith('/start') && status === 'lobby') autostartAt = now();
      if (url.endsWith('/submit')) {
        const b = (body ?? {}) as Submit;
        submitted = { taps: b.taps ?? [], partial: !!b.partial, until_ms: b.until_ms };
        const room = snapshot();
        return ok({
          entry: { seat: 0, partial: !!b.partial, verified_score: myVerified?.score ?? null, verdict: myVerified?.verdict ?? null, stats: {} },
          room,
        } as unknown as T);
      }
      return ok({ room: snapshot() } as unknown as T);
    }) as HttpLike['post'],
  };

  return { http, room: snapshot };
}
