/**
 * proof: Parade Beat proof v5 (design 9.2) and its replay.
 *
 * The phone sends two views of the same run:
 *   - `inputs` rows [noteIndex, signedDeltaMs, kind, zone] (design 9.2) for
 *     the reviewer and the note-level PHP check;
 *   - `touches`: the raw touch log in judged song time, compact and
 *     delta-coded, so the server can replay the exact judge (replayProof).
 *
 * Today's server (TaskGameProofService) validates {game, score, elapsed_ms,
 * seed}; those legacy fields stay at the top level of the result meta, so
 * ride proofs keep verifying unchanged. The v4 object rides along as
 * meta.rhythmProof for the WS7 change request (studio note in
 * src/games/rhythm/SERVER_NOTE.md).
 */

import { generate } from './generate';
import { createJudge, finishJudge, judgeDown, judgeLaunch, judgeMove, judgeTick, judgeUp, marchBarsOf, type JudgeState } from './judge';
import { summarize } from './score';
import { GAME_KEY, PROOF_VERSION, type Difficulty, type RoundFormat, type StageJson } from './types';

export interface RhythmProofV4 {
  game: 'timing';
  v: 5;
  seed: number;
  stage: string;
  chart_version: string;
  beatmap_hash: string;
  difficulty: number;
  format: RoundFormat;
  ftue: boolean;
  /** one_thumb_r | one_thumb_l | two_thumbs | two_thumbs_swap */
  grip: string;
  assist: boolean;
  /** Queue rounds Limp instead of stalling (design 3.6). */
  limp: boolean;
  /** Groove floor 10 until this song time (first ride ever); -1 = the whole run (First Parade). */
  no_fail_until_ms: number;
  touch_ts: 'est';
  audio_backend: string;
  route: string;
  offset_ms: number;
  sharp_enabled: boolean;
  pocket: boolean;
  elapsed_ms: number;
  pause_spans: [number, number][];
  march_bars: number[];
  /** Section indexes (0-5 queue, 0-2 ride) played on the March layer. */
  march_sections: number[];
  /** [launchMs, dropBar] per Fever launch. */
  fever_deploys: [number, number][];
  auto_fever: boolean;
  inputs: [number, number, number, number][];
  poppers: [number, number, number][];
  strays: number[];
  freeze_faults: number[];
  touch_count: number;
  touches: string;
  client_score: number;
  client_stars: number;
  round_token?: string;
}

/** Touch log -> "t0.type.zone.y.pid|dt.type.zone.y.pid|..." (base 36, dt from the previous touch). */
export function encodeTouches(s: JudgeState): string {
  const parts: string[] = [];
  let last = 0;
  for (let i = 0; i < s.touchT.length; i++) {
    const t = s.touchT[i];
    const dt = t - last;
    last = t;
    parts.push(`${dt.toString(36)}.${s.touchType[i]}.${s.touchZone[i]}.${Math.max(0, s.touchY[i]).toString(36)}.${s.touchPid[i].toString(36)}`);
  }
  return parts.join('|');
}

export function decodeTouches(text: string): { t: number; type: number; zone: number; y: number; pid: number }[] {
  if (!text) return [];
  let t = 0;
  return text.split('|').map((p) => {
    const [dt, type, zone, y, pid] = p.split('.');
    t += parseInt(dt, 36);
    return { t, type: Number(type), zone: Number(zone), y: parseInt(y, 36), pid: parseInt(pid, 36) };
  });
}

export interface ProofContext {
  stage: StageJson;
  format: RoundFormat;
  difficulty: Difficulty;
  seed: number;
  ftue: boolean;
  autoFever: boolean;
  noFailUntilMs: number;
  audioBackend: string;
  route: string;
  offsetMs: number;
  sharpEnabled: boolean;
  pocket: boolean;
  elapsedMs: number;
  pauseSpans: [number, number][];
  grip: string;
  assist: boolean;
  limp: boolean;
  roundToken?: string;
}

function pairsOf(a: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < a.length; i += 2) out.push([a[i], a[i + 1]]);
  return out;
}

export function marchSectionsOf(s: JudgeState): number[] {
  const out: number[] = [];
  for (let b = s.firstBar, k = 0; b <= s.lastBar; b += 4, k++) if (s.barLayer[b] === 2) out.push(k);
  return out;
}

export function buildProof(s: JudgeState, ctx: ProofContext, chartVersion: string, beatmapHash: string): RhythmProofV4 {
  const sum = summarize(s, { format: ctx.format, ftue: ctx.ftue });
  const inputs: [number, number, number, number][] = [];
  for (let i = 0; i < s.logNote.length; i++) inputs.push([s.logNote[i], s.logDelta[i], s.logKind[i], s.logZone[i]]);
  const poppers: [number, number, number][] = [];
  for (let i = 0; i + 2 < s.popperLog.length; i += 3) {
    poppers.push([s.popperLog[i], s.popperLog[i + 1], s.popperLog[i + 2]]);
  }
  return {
    game: GAME_KEY,
    v: PROOF_VERSION,
    seed: ctx.seed >>> 0,
    stage: ctx.stage.id,
    chart_version: chartVersion,
    beatmap_hash: beatmapHash,
    difficulty: ctx.difficulty,
    format: ctx.format,
    ftue: ctx.ftue,
    grip: ctx.grip,
    assist: ctx.assist,
    limp: ctx.limp,
    no_fail_until_ms: Number.isFinite(ctx.noFailUntilMs) ? Math.round(ctx.noFailUntilMs) : -1,
    touch_ts: 'est',
    audio_backend: ctx.audioBackend,
    route: ctx.route,
    offset_ms: Math.round(ctx.offsetMs),
    sharp_enabled: ctx.sharpEnabled,
    pocket: ctx.pocket,
    elapsed_ms: Math.round(ctx.elapsedMs),
    pause_spans: ctx.pauseSpans.map(([a, b]) => [Math.round(a), Math.round(b)] as [number, number]),
    march_bars: marchBarsOf(s),
    march_sections: marchSectionsOf(s),
    fever_deploys: pairsOf(s.deployT),
    auto_fever: ctx.autoFever,
    inputs,
    poppers,
    strays: s.strayT.slice(),
    freeze_faults: s.faultT.slice(),
    touch_count: s.touches,
    touches: encodeTouches(s),
    client_score: s.score,
    client_stars: sum.stars,
    ...(ctx.roundToken ? { round_token: ctx.roundToken } : {}),
  };
}

/**
 * Server-side replay (the PHP twin does the same): rebuild the chart from
 * (stage, format, difficulty, seed), re-run every touch through the judge
 * with the declared March bars, and return the server's numbers.
 */
export function replayProof(stage: StageJson, proof: RhythmProofV4): { score: number; stars: number; rideWin: boolean; judge: JudgeState } {
  const chart = generate(stage, proof.format, proof.difficulty as Difficulty, proof.seed, { ftue: proof.ftue });
  if (chart.beatmapHash !== proof.beatmap_hash) throw new Error('beatmap_hash mismatch');
  const s = createJudge(chart, {
    autoFever: proof.auto_fever,
    marchBars: proof.march_bars,
    sharpEnabled: proof.sharp_enabled,
    noFailUntilMs: proof.ftue || proof.no_fail_until_ms < 0 ? Infinity : proof.no_fail_until_ms,
    limp: proof.limp,
    assist: proof.assist,
  });
  const touches = decodeTouches(proof.touches);
  let now = chart.barStart[0];
  for (const x of touches) {
    while (now + 8 < x.t) {
      now += 8;
      judgeTick(s, now);
    }
    if (x.type === 0) judgeDown(s, x.t, x.zone, x.pid, x.y);
    else if (x.type === 1) judgeUp(s, x.t, x.pid);
    else if (x.type === 3) judgeLaunch(s, x.t, x.pid);
    else judgeMove(s, x.t, x.pid, x.y);
  }
  const end = s.stalled ? s.stallT : chart.endMs + 50;
  while (now < end && !s.stalled) {
    now += 8;
    judgeTick(s, now);
  }
  finishJudge(s, now, false);
  const sum = summarize(s, { format: proof.format, ftue: proof.ftue });
  return { score: s.score, stars: sum.stars, rideWin: sum.rideWin, judge: s };
}
