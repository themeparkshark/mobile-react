/**
 * useWhackJuice: the Bonk Rush feel layer, shared by every Whack board (solo
 * formats in WhackAShark, the live Line Party round in WhackLiveBoard).
 *
 * It turns batched sim events into sound, haptics and FX on the same frame:
 * spatial tells (pan by column, pitch by row), the C-major pitch ladder,
 * QUICK / GOOD / LATE tiers, crits, golden coin showers, the flurry tally,
 * tier-ups and fever. The FX governor keeps stacked big moments from strobing.
 *
 * Global freezes and slow-mo never touch game time in a party round (the room
 * shares one clock), so `party` keeps every hit-stop local.
 */

import { useCallback, useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import type { FxStageHandle } from '../../gamekit/fx/FxStage';
import type { CameraRig } from '../../gamekit/fx/useCamera';
import { useFeel, type FeelDef } from '../../gamekit/feel';
import { createFxGovernor, govHitStop } from '../../gamekit/core/fxGovernor';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { playHaptic } from '../../gamekit/Haptics';
import { createFlurry, flurryHit, flurryResolve, FLURRY_GROW, FLURRY_START, type FlurryState } from '../../gamekit/core/scoring';
import {
  E_BREAK, E_BRUISER, E_BUTTER, E_COIN_BUBBLE, E_DECOY, E_DOUBLE, E_ESCAPE, E_FEVER, E_FREEZE, E_HELMET, E_HIT, E_PUFF,
  E_RESUME, E_TELL, E_TIER, E_WHIFF, E_WIN,
} from './sim';
import { G_CRIT, G_GOOD, G_QUICK, K_ANGLER, K_BRUISER, K_GOLDEN, TIER_AT } from './waves';
import type { BoardLayout } from './render/layout';
import type { WhackRuntime } from './useWhackRuntime';

const GOLD = '#ffcf3b';
const CORAL = '#ff6b5c';

export function pickCue(...names: string[]): string {
  for (const n of names) if (GameAudio.hasCue(n)) return n;
  return names[names.length - 1];
}
const pick = pickCue;

export type WhackCues = ReturnType<typeof useWhackCues>;

/** Cue names (studio library first, Chris's closest sound as the fallback), preloaded while visible. */
export function useWhackCues(visible: boolean) {
  const cues = useWhackCueTable();
  useEffect(() => {
    if (!visible) return;
    if (__DEV__) GameAudio.setSfxEnabled(true);
    void GameAudio.init().then(() => GameAudio.preload([
      cues.bonk, cues.crit, cues.whiff, cues.duck, cues.golden, cues.chomp, cues.tier, ...cues.tells, cues.helmet, cues.double, cues.tally,
      cues.feverStart, cues.lookup, cues.splat, cues.squeegee, cues.bossHit,
    ])).catch(() => undefined);
  }, [visible, cues]);
  return cues;
}

function useWhackCueTable() {
  return useMemo(() => ({
    bonk: pick('wh_bonk', 'fx.hit'), crit: pick('wh_crit', 'fx.hit'), whiff: pick('wh_whiff', 'ui.tap'), duck: pick('wh_duck', 'fx.whoosh'),
    golden: pick('wh_golden_hit', 'fx.coin'), coinLayer: 'fx.coin', chomp: pick('sh_chomp', 'fx.nopeShort'), nope: 'fx.nopeShort',
    helmet: pick('wh_helmet_clank', 'ui.confirm'), double: pick('wh_double', 'fx.reveal'), puff: pick('sh_puff_inflate', 'fx.whoosh'),
    tier: pick('wh_tier', 'fx.reveal'), breakCue: pick('sh_combo_break', 'fx.nopeShort'), tally: pick('sh_tally', 'fx.coin'),
    feverStart: pick('sh_fever_start', 'fx.reveal'), feverEnd: pick('sh_fever_end', 'fx.whoosh'), lookup: pick('sh_slide_up', 'ui.select'),
    resume: pick('resume_tick', 'ui.select'), whistle: pick('sh_whistle', 'fx.whoosh'), tick: pick('ui_tick', 'ui.select'),
    start: 'fx.reveal', pip: 'ui.select', coinTick: pick('coin_tick', 'fx.coin'), splat: pick('wh_ink_splat', 'fx.hit'),
    inkWhistle: pick('wh_ink_whistle', 'fx.whoosh'), squeegee: pick('wh_squeegee', 'fx.whoosh'), fade: pick('wh_poof', 'fx.whoosh'),
    scan: pick('wh_scan', 'ui.select'), bossHit: pick('bo_hit', 'fx.hit'), stingWin: pick('sting_whack_win', 'fx.reward'),
    stingLose: pick('sting_whack_lose', 'fx.nope'), stingBoss: pick('sting_whack_boss_win', 'fx.reward'), blocked: pick('sh_shield_pop', 'fx.reveal'),
    tells: [pick('wh_tell_finn', 'ui.select'), pick('wh_tell_golden', 'fx.reveal'), pick('wh_tell_angler', 'ui.select'), pick('wh_tell_helmet', 'ui.select'),
      pick('wh_tell_twins', 'ui.select'), pick('wh_tell_sprinter', 'fx.whoosh'), pick('wh_tell_finn', 'ui.select'), pick('wh_tell_tentacle', 'ui.select'),
      pick('wh_tell_bruiser', 'fx.hit')],
    bossRoar: [pick('bo_enter_kraken', 'fx.reveal'), pick('bo_enter_ghost', 'fx.reveal'), pick('bo_enter_robo', 'fx.reveal')],
    bossKo: [pick('bo_ko_kraken', 'fx.reward'), pick('bo_ko_ghost', 'fx.reward'), pick('bo_ko_robo', 'fx.reward')],
  }), []);
}

export interface WhackJuiceOpts {
  fx: RefObject<FxStageHandle | null>;
  camera: CameraRig | null;
  cues: WhackCues;
  runtime: WhackRuntime;
  layout: MutableRefObject<BoardLayout | null>;
  width: number;
  reducedMotion: boolean;
  walking: boolean;
  /** Live party round: hit-stops stay local, no global freeze or slow-mo (the room clock never stops). */
  party?: boolean;
  onFever?: (on: boolean) => void;
}

export interface WhackJuice {
  /** Handle one sim event; false when the event is not a board-feel event (boss, splats, end: the caller's). */
  handle: (kind: number, a: number, b: number, c: number, now: number) => boolean;
  fire: (name: string, at: Record<string, unknown>) => void;
  fireHit: (name: string, h: number, text: string | undefined, step: number) => void;
  holeXY: (h: number) => { x: number; y: number };
  hud: { x: number; y: number };
  liveScore: MutableRefObject<number>;
  streak: MutableRefObject<number>;
  tier: MutableRefObject<number>;
  flurry: MutableRefObject<FlurryState>;
  /** New Burst: zero the live score and flurry, carry the streak. */
  reset: (streak: number) => void;
}

export function useWhackJuice(opts: WhackJuiceOpts): WhackJuice {
  const { fx, camera, cues, runtime, layout, width, reducedMotion, walking, party } = opts;
  const onFeverRef = useRef(opts.onFever);
  onFeverRef.current = opts.onFever;
  const table = useMemo<Record<string, FeelDef>>(() => ({
    late: { sfx: cues.bonk, ladder: true, spatial: true, haptic: 'lateHit', localStop: 45, burst: [{ emitter: 'bubbles', count: 3 }],
      ring: { from: 8, to: 40, ms: 150 }, flyUp: { size: 'sm' } },
    good: { sfx: cues.bonk, ladder: true, spatial: true, haptic: 'goodHit', localStop: 45, burst: [{ emitter: 'stars', count: 6 }],
      ring: { from: 10, to: 70, ms: 180 }, flyUp: { size: 'md' } },
    quick: { prio: 1, sfx: cues.bonk, ladder: true, spatial: true, haptic: 'quickHit', localStop: 65,
      burst: [{ emitter: 'impact' }, { emitter: 'splash', count: 10 }], ring: { color: GOLD, from: 12, to: 80, ms: 200 },
      bloom: { radius: 80, peak: 0.6, ms: 160 }, flyUp: { size: 'lg', color: GOLD } },
    crit: { prio: 2, sfx: cues.crit, spatial: true, haptic: 'crit', localStop: 90,
      burst: [{ emitter: 'impact', size: 1.4 }, { emitter: 'sparks' }, { emitter: 'splash', count: 8 }],
      ring: { color: GOLD, from: 14, to: 110, ms: 240 }, bloom: { radius: 110, peak: 0.85, ms: 220 }, flyUp: { size: 'lg', color: '#ffe07a' } },
    golden: { prio: 5, sfx: cues.golden, haptic: 'golden', hitStop: 110, hitStopSim: true, forceStop: true, slowMo: [0.35, 280, 120], punch: 0.03,
      burst: [{ emitter: 'speedLines', count: 12 }, { emitter: 'coins', count: 16, magnet: true }, { emitter: 'sparkles' }],
      vignette: { color: GOLD, peak: 0.35, inMs: 40, holdMs: 60, outMs: 260 }, flyUp: { size: 'xl', color: GOLD }, duckDb: 6 },
    angler: { sfx: cues.chomp, haptic: 'punish', localStop: 90, shake: 0.25, burst: [{ emitter: 'bubbles', count: 8, color: 0xffff6b5c }],
      vignette: { color: CORAL, peak: 0.3, inMs: 20, holdMs: 0, outMs: 200 }, flyUp: { size: 'md', color: CORAL } },
    helmet: { sfx: cues.helmet, haptic: 'quickHit', localStop: 60, burst: [{ emitter: 'sparks', count: 4 }], flyUp: { size: 'sm' } },
    double: { sfx: cues.double, haptic: 'crit', localStop: 80, burst: [{ emitter: 'bubbles', count: 8 }, { emitter: 'stars', count: 6 }],
      flyUp: { size: 'lg', color: '#7fd6ff' } },
    whiff: { sfx: cues.whiff, volume: 0.35, burst: [{ emitter: 'puff', count: 4 }] },
    butter: { sfx: cues.breakCue, haptic: 'comboBreak', flyUp: { size: 'md', color: CORAL } },
    escape: { sfx: cues.duck, volume: 0.55, spatial: true, burst: [{ emitter: 'bubbles', count: 4 }] },
    tierUp: { sfx: cues.tier, ladder: true, haptic: 'tierUp', burst: [{ emitter: 'confetti', count: 16 }] },
    comboBreak: { sfx: cues.breakCue, haptic: 'comboBreak' },
    fever: { prio: 4, sfx: cues.feverStart, haptic: 'feverStart', hitStop: 80, hitStopSim: true, forceStop: true, flash: { color: '#ffffff', peak: 0.4, ms: 160 },
      burst: [{ emitter: 'speedLines', count: 16 }, { emitter: 'confetti', count: 26 }],
      vignette: { color: GOLD, peak: 0.28, inMs: 120, holdMs: 6600, outMs: 300 }, flyUp: { size: 'xl', color: GOLD } },
    feverEnd: { sfx: cues.feverEnd },
    bossHit: { sfx: cues.bossHit, haptic: 'quickHit', shake: 0.3 },
    bossDown: { prio: 6, force: true, haptic: 'ko', hitStop: 160, hitStopSim: true, forceStop: true, slowMo: [0.3, 500, 200], shake: 0.8, punch: 0.05,
      burst: [{ emitter: 'confetti', count: 60 }, { emitter: 'coins', count: 24, magnet: true }], flash: { color: '#ffffff', peak: 0.35, ms: 200 },
      flyUp: { size: 'xl', color: GOLD } },
    splat: { sfx: cues.splat, haptic: 'lateHit', burst: [{ emitter: 'ink', count: 8 }] },
    squeegee: { sfx: cues.squeegee, haptic: 'tick', burst: [{ emitter: 'splash', count: 6 }] },
    coinBubble: { sfx: cues.coinLayer, haptic: 'tick', burst: [{ emitter: 'coins', count: 4, magnet: true }], flyUp: { size: 'sm', color: GOLD } },
    tellGolden: { sfx: cues.tells[1], volume: 0.8, spatial: true, haptic: 'goldenTell', tell: true, burst: [{ emitter: 'sparkles', count: 6 }] },
    tellAngler: { sfx: cues.tells[2], volume: 0.8, spatial: true, haptic: 'anglerTell', tell: true },
  }), [cues]);
  // One governor per board: stacked goldens, fever and boss beats read as one big moment, never a strobe.
  const governor = useMemo(() => createFxGovernor({ calm: reducedMotion || walking }), [reducedMotion, walking]);
  const feel = useFeel(table, { fx, camera, clock: null, width, calm: reducedMotion || walking, governor });
  const liveScore = useRef(0);
  const streak = useRef(0);
  const tier = useRef(0);
  const flurry = useRef(createFlurry(900, 3));
  const hud = useMemo(() => ({ x: width - 50, y: 40 }), [width]);

  const holeXY = useCallback((h: number) => {
    const G = layout.current;
    if (!G) return { x: 0, y: 0 };
    return { x: G.cx[h], y: G.my[h] - G.spriteH[h] * 0.7 };
  }, [layout]);

  const fireHit = (name: string, h: number, text: string | undefined, step: number) => {
    const p = holeXY(h);
    const clock = runtime.clock;
    const def = table[name];
    feel(name as never, { ...p, slot: h, step, text, magnetTo: hud, dx: 0, dy: -1 });
    // Local hit-stop and global freezes go straight to the Bonk Rush clock.
    if (clock && def) {
      if (def.localStop) clock.localStop(h, reducedMotion ? Math.min(40, def.localStop) : def.localStop);
      if (def.hitStop) {
        if (party) {
          // Shared clock: the struck hole takes the whole beat instead.
          clock.localStop(h, Math.min(120, def.hitStop));
        } else {
          const want = reducedMotion ? Math.min(60, def.hitStop) : def.hitStop;
          const ms = govHitStop(governor, Date.now(), want, def.prio ?? 0, !!def.forceStop);
          if (ms > 0) clock.hitStop(ms, { holdSim: def.hitStopSim, force: def.forceStop });
        }
      }
      if (def.slowMo && !reducedMotion && !party) clock.slowMo(def.slowMo[0], def.slowMo[1], def.slowMo[2]);
    }
  };

  const handle = (kind: number, a: number, b: number, c: number, now: number): boolean => {
    const G = layout.current;
    switch (kind) {
      case E_TELL: {
        const h = a;
        const k = b;
        const col = h % 3;
        const row = Math.floor(h / 3);
        const pan = (col - 1) * 0.6;
        const pitch = row === 0 ? 4 : row === 2 ? -3 : 0;
        if (k === K_GOLDEN) feel('tellGolden', { ...holeXY(h) });
        else if (k === K_ANGLER) feel('tellAngler', { ...holeXY(h) });
        else GameAudio.play(cues.tells[k] ?? cues.tells[0], { pan, pitch, volume: 0.55 });
        if (k === K_BRUISER) playHaptic('lateHit', { tell: true });
        return true;
      }
      case E_HIT: {
        const h = a;
        const grade = b % 10;
        const k = Math.floor(b / 10);
        const pts = c;
        liveScore.current += pts;
        streak.current += 1;
        const step = Math.max(0, streak.current - TIER_AT[tier.current]) % 8;
        const fl = flurryHit(flurry.current, now, pts);
        const quiet = fl === FLURRY_GROW || (fl === FLURRY_START && flurry.current.hits > 2);
        if (k === K_GOLDEN) {
          fireHit('golden', h, `GOLDEN! +${pts}`, step);
          GameAudio.play(cues.coinLayer, { volume: 0.8 });
        } else if (grade === G_CRIT) {
          fireHit('crit', h, quiet ? undefined : `CRIT! +${pts}`, step);
          GameAudio.play(cues.bonk, { volume: 0.7 });
        } else if (grade === G_QUICK) fireHit('quick', h, quiet ? undefined : `QUICK +${pts}`, step);
        else if (grade === G_GOOD) fireHit('good', h, quiet ? undefined : `+${pts}`, step);
        else fireHit('late', h, quiet ? undefined : `+${pts}`, step);
        if (quiet && G) fx.current?.flyUp(`${flurry.current.hits} HITS +${flurry.current.points}`, G.w / 2, G.topH * 0.62, { size: 'md', color: '#ffe07a', key: 'flurry' });
        return true;
      }
      case E_BRUISER:
        liveScore.current += c;
        streak.current += 1;
        fireHit(b <= 0 ? 'crit' : 'good', a, b <= 0 ? `KNOCKOUT! +${c}` : `+${c}`, streak.current % 8);
        return true;
      case E_WHIFF:
        feel('whiff', { ...holeXY(a) });
        return true;
      case E_BUTTER:
        feel('butter', { ...holeXY(a), text: 'BUTTERFINGERS!' });
        return true;
      case E_DECOY:
        liveScore.current += c;
        fireHit('angler', a, `${c}`, 0);
        GameAudio.play(cues.nope, { volume: 0.7 });
        return true;
      case E_COIN_BUBBLE:
        liveScore.current += b;
        fireHit('coinBubble', a, `+${b}`, 0);
        return true;
      case E_ESCAPE:
        feel('escape', { ...holeXY(a) });
        if (c === 1 && streak.current >= 3) fx.current?.flyUp('MISS', holeXY(a).x, holeXY(a).y, { size: 'sm', color: '#dbe6f0' });
        return true;
      case E_HELMET:
        liveScore.current += b;
        fireHit('helmet', a, `+${b}`, 0);
        return true;
      case E_DOUBLE: {
        liveScore.current += c;
        const p1 = holeXY(a);
        const p2 = holeXY(b);
        feel('double', { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2, text: 'DOUBLE BONK!' });
        return true;
      }
      case E_TIER:
        tier.current = a;
        if (G) feel('tierUp', { x: G.w / 2, y: 48, step: a - 1 });
        return true;
      case E_BREAK:
        if (a >= 5) feel('comboBreak');
        streak.current = 0;
        tier.current = 0;
        return true;
      case E_FEVER:
        if (a === 1) {
          onFeverRef.current?.(true);
          if (G) feel('fever', { x: G.w / 2, y: G.topH + (G.h - G.topH) * 0.35, text: 'FEVER!' });
        } else {
          onFeverRef.current?.(false);
          feel('feverEnd');
        }
        return true;
      case E_FREEZE:
        GameAudio.play(cues.lookup, { volume: 0.5 });
        GameAudio.music.setState('muffled', 200);
        return true;
      case E_RESUME:
        playHaptic('tick');
        GameAudio.play(cues.resume, { volume: 0.6 });
        GameAudio.music.setState('open', 300);
        return true;
      case E_PUFF:
        feel('whiff', { ...holeXY(a) });
        GameAudio.play(cues.puff, { volume: 0.7 });
        playHaptic('lateHit');
        return true;
      case E_WIN:
        GameAudio.play('fx.reward');
        return true;
      default:
        return false;
    }
  };

  // Flurry tally resolves 300 ms after the flurry ends.
  useEffect(() => {
    const iv = setInterval(() => {
      if (flurryResolve(flurry.current, Date.now())) GameAudio.play(cues.tally, { volume: 0.8 });
    }, 100);
    return () => clearInterval(iv);
  }, [cues]);

  const reset = useCallback((s: number) => {
    liveScore.current = 0;
    streak.current = s;
    flurry.current = createFlurry(900, 3);
  }, []);

  return {
    handle, fire: feel as unknown as WhackJuice['fire'], fireHit, holeXY, hud, liveScore, streak, tier, flurry, reset,
  };
}

export { GOLD, CORAL };
