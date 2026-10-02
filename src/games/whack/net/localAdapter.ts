/**
 * createLocalNetAdapter: an in-process stand-in for the Whack server (dev
 * MiniGameTester, offline demo, tests). It verifies every proof with the
 * reference verifier, plays house-crew rivals with the seeded autoplayer on
 * the identical timeline, and emits the same server events the Reverb adapter
 * will (DuelBurstRevealed, RaidHpChanged). Production uses WS5's adapter.
 */

import { autoplayBurst, type ProfileName } from '../autoplayer';
import { buildBurst } from '../timeline';
import { proofInput, verifyProof, type WhackProofV2 } from '../proof';
import { burstWinner, duelWinner, sabotageSenders, type DuelBurstScore } from './duel';
import { ghostFromRun } from './ghost';
import { applyRaidBurst, createRaid, raidSlices, type RaidState } from './raid';
import type { BurstVerdict, DuelReveal, WhackNetAdapter, WhackServerEvent } from './types';

function triples(flat: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]);
  return out;
}

export interface LocalAdapterOptions {
  rivalProfile?: ProfileName;
  rivalName?: string;
  crew?: string[];
  /** Delay before the rival "finishes" (ms); the reveal waits for both. */
  rivalDelayMs?: number;
  now?: () => number;
}

export function createLocalNetAdapter(opts: LocalAdapterOptions = {}): WhackNetAdapter & {
  duelHistory: DuelBurstScore[];
  raid: RaidState | null;
  rivalIncoming: number[];
} {
  const subs = new Set<(e: WhackServerEvent) => void>();
  const emit = (e: WhackServerEvent) => subs.forEach((cb) => cb(e));
  const now = opts.now ?? (() => Date.now());
  const duelHistory: DuelBurstScore[] = [];
  let raid: RaidState | null = null;
  let rivalIncoming: number[] = [];
  const adapter: WhackNetAdapter & { duelHistory: DuelBurstScore[]; raid: RaidState | null; rivalIncoming: number[] } = {
    duelHistory,
    raid,
    rivalIncoming,
    async submitBurst(proof: WhackProofV2): Promise<BurstVerdict> {
      const v = verifyProof(proof);
      if (!v.ok) return { ok: false, reason: v.reason };
      const tl = buildBurst(proofInput(proof));
      if (proof.format === 'duel') {
        // The rival plays the identical Burst (with the splats I queued into it last time).
        const rivalTl = buildBurst({ ...proofInput(proof), incoming: rivalIncoming.length ? { matchSeed: proof.incoming?.match_seed ?? proof.seed, senderEventIds: rivalIncoming } : null });
        const rival = autoplayBurst(rivalTl, opts.rivalProfile ?? 'median', proof.seed ^ (proof.burst * 977));
        const myTaps = proof.taps.map((t) => [t[0], t[1], t[2]]);
        const sentByMe = sabotageSenders(tl, myTaps);
        const sentByRival = sabotageSenders(rivalTl, triples(rival.sim.taps));
        rivalIncoming = sentByMe;
        adapter.rivalIncoming = rivalIncoming;
        const b: DuelBurstScore = { me: v.result.score, rival: rival.result.score, meStreak: v.result.maxStreak, rivalStreak: rival.result.maxStreak };
        duelHistory.push(b);
        const w = duelWinner(duelHistory);
        const myGhost = ghostFromRun(tl, myTaps, 'me', proof.elapsed_ms);
        const rivalGhost = ghostFromRun(rivalTl, triples(rival.sim.taps), opts.rivalName ?? 'Rival');
        const reveal: DuelReveal = {
          matchId: `local-${proof.seed}`,
          burstIndex: proof.burst,
          me: { score: b.me ?? 0, hits: myGhost.hits },
          rival: { score: b.rival ?? 0, hits: rivalGhost.hits },
          winner: burstWinner(b),
          wins: w.wins,
          sent: sentByMe.length,
          incoming: sentByRival,
          matchOver: w.over,
          matchWinner: w.over ? w.winner : undefined,
        };
        setTimeout(() => emit({ type: 'DuelBurstRevealed', reveal }), opts.rivalDelayMs ?? 900);
        return { ok: true, score: v.result.score, result: v.result, flagged: v.flagged, duel: reveal };
      }
      if (proof.format === 'raid') {
        const crew = opts.crew ?? ['me', 'Bubbles', 'Captain Fin'];
        if (!raid) {
          raid = createRaid(crew.length, now());
          adapter.raid = raid;
        }
        // House crewmates attack on their own schedule: one Raid Burst each per player submit.
        const t = now();
        crew.slice(1).forEach((m, i) => {
          const bot = autoplayBurst(tl, i % 2 ? 'novice' : 'median', proof.seed + i * 131 + proof.burst);
          applyRaidBurst(raid!, m, bot.result.bossDamage, t - 20000 * (i + 1));
        });
        const applied = applyRaidBurst(raid, 'me', v.result.bossDamage, t);
        const update = {
          raidId: `local-${proof.seed}`, hpNow: raid.hp, hpMax: raid.hpMax, damage: applied?.applied ?? 0,
          tagTeam: applied?.tagTeam ?? false,
          crew: raidSlices(raid, crew).map((s) => ({ id: s.member, name: s.member, color: s.color, damage: s.damage })),
          defeated: raid.hp === 0,
        };
        setTimeout(() => emit({ type: 'RaidHpChanged', update }), 300);
        return { ok: true, score: v.result.score, result: v.result, flagged: v.flagged, raid: update };
      }
      return { ok: true, score: v.result.score, result: v.result, flagged: v.flagged };
    },
    subscribe(cb: (e: WhackServerEvent) => void) {
      subs.add(cb);
      return () => { subs.delete(cb); };
    },
    sendEmote(id: number) {
      setTimeout(() => emit({ type: 'Emote', from: opts.rivalName ?? 'Rival', sticker: (id + 3) % 8 }), 1200);
    },
  };
  return adapter;
}
