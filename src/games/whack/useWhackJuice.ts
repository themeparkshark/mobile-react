/**
 * useWhackJuice: the Bonk Rush feel layer (design v4 6.6, 7.3, 8.6-8.10, 10, 11),
 * shared by every Whack board (solo formats in WhackAShark, the live Line
 * Party round in WhackLiveBoard).
 *
 * It turns batched sim events into sound, haptics and FX on the same frame:
 *   - Tells are rhythmic phrases by kind (Finn two 16ths, golden a triplet,
 *     angler a held sonar note) rendered per row (+4/0/-3 st), panned by
 *     column as a bonus; the pop lands on the beat.
 *   - Hits: the grade teaches through the stop (LATE 0, GOOD 50, QUICK 80,
 *     crit 100 ms local), the C-major ladder, Core Haptics patterns on the
 *     whack priority bus (1 per 90 ms, tells 1 per 300 ms, decoys first).
 *   - Golden: global 110 ms freeze, 0.35x for 280 ms, a 1.04 push-in.
 *   - Combo slab after a flurry, tier-up / tier drop, banked FEVER READY.
 *   - Clutter governor (7.4): with 3+ wells busy, ambient droplets stop and
 *     particle counts drop so tells stay readable.
 *
 * Global freezes and slow-mo never touch game time in a party round (the room
 * shares one clock), so `party` keeps every hit-stop local.
 */

import { useCallback, useEffect, useMemo, useRef, type MutableRefObject, type RefObject } from 'react';
import type { FxStageHandle } from '../../gamekit/fx/FxStage';
import type { CameraRig } from '../../gamekit/fx/useCamera';
import type { StampLayerHandle } from '../../gamekit/fx/StampLayer';
import { useFeel, type FeelDef } from '../../gamekit/feel';
import { createFxGovernor, govHitStop } from '../../gamekit/core/fxGovernor';
import { WHACK_PRIO } from '../../gamekit/core/hapticBus';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { configureHaptics, playPattern } from '../../gamekit/Haptics';
import { createFlurry, flurryHit, flurryResolve, FLURRY_GROW, FLURRY_START, type FlurryState } from '../../gamekit/core/scoring';
import {
  E_BREAK, E_BRUISER, E_BUTTER, E_COIN_BUBBLE, E_DECOY, E_DOUBLE, E_EMERGE, E_ESCAPE, E_FEVER, E_FEVER_READY, E_FREEZE, E_HELMET, E_HIT,
  E_PUFF, E_RESUME, E_TELL, E_TIER, E_TIER_DROP, E_WHIFF, E_WIN,
} from './sim';
import { E_HAT_BOUNCE } from './useWhackRuntime';
import { G_CRIT, G_GOOD, G_QUICK, K_ANGLER, K_BRUISER, K_GOLDEN, K_HELMET, K_PUFFER, K_TENTACLE, K_TWIN, MULT_CAP, TIER_AT, TIER_MULT } from './waves';
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
      cues.bonk, cues.crit, cues.whiff, cues.duck, cues.golden, cues.chomp, cues.tier, ...cues.tells, ...cues.phrases.flat(), cues.helmet, cues.double,
      cues.tally, cues.feverStart, cues.lookup, cues.splat, cues.squeegee, cues.bossHit, cues.hatBounce, cues.swing, cues.comboDrop, cues.starSlam,
    ])).catch(() => undefined);
  }, [visible, cues]);
  return cues;
}

/** Phrase cue per tell kind and row (v4 10.2), falling back to the per-row v3 tell, then the plain tell. */
function phraseRow(kind: string, legacy: string, fallback: string): string[] {
  return [0, 1, 2].map((r) => pick(`wh_phrase_${kind}_row${r}`, `wh_tell_${legacy}_row${r}`, `wh_tell_${legacy}`, fallback));
}

function useWhackCueTable() {
  return useMemo(() => ({
    bonk: pick('wh_bonk', 'fx.hit'), crit: pick('wh_crit', 'fx.hit'), whiff: pick('wh_whiff', 'ui.tap'), duck: pick('wh_duck', 'fx.whoosh'),
    golden: pick('wh_golden_hit', 'fx.coin'), coinLayer: 'fx.coin', chomp: pick('sh_chomp', 'fx.nopeShort'), nope: 'fx.nopeShort',
    helmet: pick('wh_helmet_clank', 'ui.confirm'), double: pick('wh_double', 'fx.reveal'), puff: pick('sh_puff_inflate', 'fx.whoosh'),
    tier: pick('wh_tier', 'fx.reveal'), breakCue: pick('sh_combo_break', 'fx.nopeShort'), comboDrop: pick('wh_combo_drop', 'sh_combo_break', 'fx.nopeShort'),
    tally: pick('sh_tally', 'fx.coin'), starSlam: pick('wh_star_slam', 'fx.hit'),
    feverStart: pick('sh_fever_start', 'fx.reveal'), feverEnd: pick('sh_fever_end', 'fx.whoosh'), lookup: pick('sh_slide_up', 'ui.select'),
    resume: pick('resume_tick', 'ui.select'), whistle: pick('sh_whistle', 'fx.whoosh'), tick: pick('ui_tick', 'ui.select'),
    start: 'fx.reveal', pip: 'ui.select', coinTick: pick('coin_tick', 'fx.coin'), splat: pick('wh_ink_splat', 'fx.hit'),
    inkWhistle: pick('wh_ink_whistle', 'fx.whoosh'), squeegee: pick('wh_squeegee', 'fx.whoosh'), fade: pick('wh_poof', 'fx.whoosh'),
    scan: pick('wh_scan', 'ui.select'), bossHit: pick('bo_hit', 'fx.hit'), stingWin: pick('sting_whack_win', 'fx.reward'),
    stingLose: pick('sting_whack_lose', 'fx.nope'), stingBoss: pick('sting_whack_boss_win', 'fx.reward'), blocked: pick('sh_shield_pop', 'fx.reveal'),
    hatBounce: pick('wh_hat_bounce', 'ui.tap'), swing: pick('wh_swing', 'ui.tap'),
    tells: [pick('wh_tell_finn', 'ui.select'), pick('wh_tell_golden', 'fx.reveal'), pick('wh_tell_angler', 'ui.select'), pick('wh_tell_helmet', 'ui.select'),
      pick('wh_tell_twins', 'ui.select'), pick('wh_tell_sprinter', 'fx.whoosh'), pick('wh_tell_finn', 'ui.select'), pick('wh_tell_tentacle', 'ui.select'),
      pick('wh_tell_bruiser', 'fx.hit')],
    /** Rhythmic tell phrases per kind id and row (finn, golden, angler, helmet, twins->finn, -, -, tentacle, bruiser->champ). */
    phrases: [
      phraseRow('finn', 'finn', 'ui.select'), phraseRow('golden', 'golden', 'fx.reveal'), phraseRow('angler', 'angler', 'ui.select'),
      phraseRow('helmet', 'helmet', 'ui.select'), phraseRow('finn', 'twins', 'ui.select'), phraseRow('finn', 'sprinter', 'fx.whoosh'),
      phraseRow('angler', 'angler', 'ui.select'), phraseRow('finn', 'tentacle', 'ui.select'), phraseRow('champ', 'bruiser', 'fx.hit'),
    ],
    bossRoar: [pick('bo_enter_kraken', 'fx.reveal'), pick('bo_enter_ghost', 'fx.reveal'), pick('bo_enter_robo', 'fx.reveal')],
    bossKo: [pick('bo_ko_kraken', 'fx.reward'), pick('bo_ko_ghost', 'fx.reward'), pick('bo_ko_robo', 'fx.reward')],
  }), []);
}

export interface WhackJuiceOpts {
  fx: RefObject<FxStageHandle | null>;
  stamps?: RefObject<StampLayerHandle | null>;
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
  onFeverReady?: () => void;
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
  /** Wells in tell or up right now (clutter governor). */
  busy: MutableRefObject<Set<number>>;
  /** New Burst: zero the live score and flurry, carry the streak. */
  reset: (streak: number) => void;
}

export function useWhackJuice(opts: WhackJuiceOpts): WhackJuice {
  const { fx, stamps, camera, cues, runtime, layout, width, reducedMotion, walking, party } = opts;
  const onFeverRef = useRef(opts.onFever);
  onFeverRef.current = opts.onFever;
  const onReadyRef = useRef(opts.onFeverReady);
  onReadyRef.current = opts.onFeverReady;
  useEffect(() => {
    configureHaptics('whack');
    return () => configureHaptics('default');
  }, []);
  const table = useMemo<Record<string, FeelDef>>(() => ({
    // v4 three FX tiers (8.6); hit-stops teach the grade (6.6).
    late: { sfx: cues.bonk, ladder: true, spatial: true, pattern: 'whackLate', priority: WHACK_PRIO.good, burst: [{ emitter: 'bubbles', count: 3 }],
      ring: { from: 8, to: 40, ms: 150 }, flyUp: { size: 'sm' } },
    good: { sfx: cues.bonk, ladder: true, spatial: true, pattern: 'whackGood', priority: WHACK_PRIO.good, localStop: 50, burst: [{ emitter: 'stars', count: 6 }],
      ring: { from: 10, to: 70, ms: 180 }, flyUp: { size: 'md' } },
    goodLite: { sfx: cues.bonk, ladder: true, spatial: true, pattern: 'whackGood', priority: WHACK_PRIO.good, localStop: 50, burst: [{ emitter: 'stars', count: 3 }],
      ring: { from: 10, to: 60, ms: 180 } },
    quick: { prio: 1, sfx: cues.bonk, ladder: true, spatial: true, pattern: 'whackQuick', priority: WHACK_PRIO.quick, localStop: 80,
      burst: [{ emitter: 'impact' }, { emitter: 'splash', count: 8 }], ring: { color: GOLD, from: 12, to: 80, ms: 200 },
      bloom: { radius: 80, peak: 0.55, ms: 160 }, flyUp: { size: 'lg', color: GOLD } },
    quickLite: { prio: 1, sfx: cues.bonk, ladder: true, spatial: true, pattern: 'whackQuick', priority: WHACK_PRIO.quick, localStop: 80,
      burst: [{ emitter: 'impact' }, { emitter: 'splash', count: 3 }], ring: { color: GOLD, from: 12, to: 70, ms: 200 } },
    crit: { prio: 2, sfx: cues.crit, spatial: true, pattern: 'whackCrit', priority: WHACK_PRIO.quick, localStop: 100,
      burst: [{ emitter: 'impact', size: 1.4 }, { emitter: 'sparks' }, { emitter: 'splash', count: 8 }],
      ring: { color: GOLD, from: 14, to: 110, ms: 240 }, bloom: { radius: 110, peak: 0.8, ms: 220 }, flyUp: { size: 'lg', color: '#ffe07a' } },
    golden: { prio: 5, sfx: cues.golden, pattern: 'goldenHit', priority: WHACK_PRIO.golden, hitStop: 110, hitStopSim: true, forceStop: true, slowMo: [0.35, 280, 120],
      burst: [{ emitter: 'speedLines', count: 12 }, { emitter: 'coins', count: 16, magnet: true }, { emitter: 'sparkles' }],
      vignette: { color: GOLD, peak: 0.35, inMs: 40, holdMs: 60, outMs: 260 }, flyUp: { size: 'xl', color: GOLD }, duckDb: 6 },
    angler: { sfx: cues.chomp, pattern: 'anglerHit', priority: WHACK_PRIO.decoy, localStop: 90, shake: 0.25, burst: [{ emitter: 'bubbles', count: 8, color: 0xffff6b5c }],
      vignette: { color: CORAL, peak: 0.3, inMs: 20, holdMs: 0, outMs: 200 }, flyUp: { size: 'md', color: CORAL } },
    helmet: { sfx: cues.helmet, pattern: 'whackGood', priority: WHACK_PRIO.good, localStop: 60, burst: [{ emitter: 'sparks', count: 4 }], flyUp: { size: 'sm' } },
    double: { sfx: cues.double, pattern: 'whackCrit', priority: WHACK_PRIO.golden, localStop: 80, burst: [{ emitter: 'bubbles', count: 8 }, { emitter: 'stars', count: 6 }],
      flyUp: { size: 'lg', color: '#7fd6ff' } },
    whiff: { sfx: cues.whiff, volume: 0.32, burst: [{ emitter: 'puff', count: 4 }] },
    butter: { sfx: cues.breakCue, pattern: [{ t: 0, kind: 'transient', i: 0.6, s: 0.2 }, { t: 70, kind: 'transient', i: 0.4, s: 0.2 }], priority: WHACK_PRIO.decoy,
      flyUp: { size: 'md', color: CORAL } },
    escape: { sfx: cues.duck, volume: 0.5, spatial: true },
    tierUp: { sfx: cues.tier, ladder: true, pattern: 'tierUp', priority: WHACK_PRIO.golden, burst: [{ emitter: 'confetti', count: 16 }] },
    tierDrop: { sfx: cues.comboDrop, volume: 0.7, pattern: 'tierDrop', priority: WHACK_PRIO.flow },
    comboBreak: { sfx: cues.breakCue, pattern: [{ t: 0, kind: 'transient', i: 0.6, s: 0.2 }, { t: 70, kind: 'transient', i: 0.4, s: 0.2 }], priority: WHACK_PRIO.decoy },
    feverReady: { sfx: cues.tier, pattern: 'tierUp', priority: WHACK_PRIO.golden, burst: [{ emitter: 'sparkles', count: 10 }], flyUp: { size: 'lg', color: GOLD } },
    fever: { prio: 4, sfx: cues.feverStart, pattern: 'tierUp', priority: WHACK_PRIO.golden, hitStop: 80, hitStopSim: true, forceStop: true,
      flash: { color: '#ffffff', peak: 0.4, ms: 160 }, burst: [{ emitter: 'speedLines', count: 16 }, { emitter: 'confetti', count: 26 }],
      vignette: { color: GOLD, peak: 0.24, inMs: 120, holdMs: 6600, outMs: 300 }, flyUp: { size: 'xl', color: GOLD } },
    feverEnd: { sfx: cues.feverEnd, burst: [{ emitter: 'stars', count: 6 }] },
    bossHit: { sfx: cues.bossHit, pattern: 'whackQuick', priority: WHACK_PRIO.golden, shake: 0.3 },
    bossDown: { prio: 6, force: true, pattern: 'finalBonk', priority: WHACK_PRIO.golden, burst: [{ emitter: 'coins', count: 24, magnet: true }], flyUp: { size: 'xl', color: GOLD } },
    splat: { sfx: cues.splat, pattern: 'whackLate', priority: WHACK_PRIO.good, burst: [{ emitter: 'ink', count: 8 }] },
    squeegee: { sfx: cues.squeegee, pattern: 'lookUpResume', priority: WHACK_PRIO.flow, burst: [{ emitter: 'splash', count: 6 }] },
    coinBubble: { sfx: cues.coinLayer, pattern: 'whackLate', priority: WHACK_PRIO.good, burst: [{ emitter: 'coins', count: 4, magnet: true }], flyUp: { size: 'sm', color: GOLD } },
    tellGolden: { pattern: 'goldenTell', priority: WHACK_PRIO.goldenTell, tell: true, burst: [{ emitter: 'sparkles', count: 6 }] },
    tellAngler: { pattern: 'purrTell', priority: WHACK_PRIO.decoy, tell: true },
    combo: { sfx: cues.tally, volume: 0.85, stamp: { style: 'slab', color: GOLD, size: 30 } },
  }), [cues]);
  // One governor per board: stacked goldens, fever and boss beats read as one big moment, never a strobe.
  const governor = useMemo(() => createFxGovernor({ calm: reducedMotion || walking }), [reducedMotion, walking]);
  const feel = useFeel(table, { fx, camera, clock: null, width, calm: reducedMotion || walking, governor, stamps });
  const liveScore = useRef(0);
  const streak = useRef(0);
  const tier = useRef(0);
  const flurry = useRef(createFlurry(900, 3));
  const lastHit = useRef({ x: 0, y: 0, mult: 1 });
  const busy = useRef(new Set<number>());
  const hud = useMemo(() => ({ x: width / 2, y: 34 }), [width]);

  const holeXY = useCallback((h: number) => {
    const G = layout.current;
    if (!G) return { x: 0, y: 0 };
    return { x: G.cx[h], y: G.my[h] - G.spriteH[h] * 0.7 };
  }, [layout]);

  const fireHit = (name: string, h: number, text: string | undefined, step: number) => {
    const p = holeXY(h);
    const clock = runtime.clock;
    const def = table[name];
    feel(name as never, { ...p, slot: h, step, text, magnetTo: hud, dx: 0, dy: -1, input: true });
    // Local hit-stop and global freezes go straight to the Bonk Rush clock.
    if (clock && def) {
      if (def.localStop) clock.localStop(h, reducedMotion ? Math.min(40, def.localStop) : def.localStop);
      if (def.hitStop) {
        if (party) {
          // Shared clock: the struck well takes the whole beat instead.
          clock.localStop(h, Math.min(120, def.hitStop));
        } else {
          const want = reducedMotion ? Math.min(40, def.hitStop) : def.hitStop;
          const ms = govHitStop(governor, Date.now(), want, def.prio ?? 0, !!def.forceStop);
          if (ms > 0) clock.hitStop(ms, { holdSim: def.hitStopSim, force: def.forceStop });
        }
      }
      if (def.slowMo && !reducedMotion && !party) clock.slowMo(def.slowMo[0], def.slowMo[1], def.slowMo[2]);
    }
  };

  const multNow = () => Math.min(MULT_CAP, TIER_MULT[tier.current] ?? 1);

  const handle = (kind: number, a: number, b: number, c: number, now: number): boolean => {
    const G = layout.current;
    switch (kind) {
      case E_TELL: {
        const h = a;
        const k = b;
        const col = h % 3;
        const row = Math.floor(h / 3);
        busy.current.add(h);
        const pan = (col - 1) * 0.6;
        const phrase = (cues.phrases[k] ?? cues.phrases[0])[row] ?? cues.tells[0];
        // Decoys and goldens carry the loudest phrases; Finn phrases sit under impacts.
        GameAudio.play(phrase, { pan, volume: k === K_ANGLER || k === K_PUFFER ? 0.85 : k === K_GOLDEN ? 0.8 : 0.6 });
        // Tell haptics: 1 per 300 ms on the bus; with 3+ wells busy only decoy tells keep theirs.
        const crowded = busy.current.size >= 3;
        if (k === K_GOLDEN && !crowded) feel('tellGolden', { ...holeXY(h) });
        else if (k === K_ANGLER || k === K_PUFFER) feel('tellAngler', { ...holeXY(h) });
        else if (k === K_BRUISER && !crowded) playPattern('champSlam', { priority: WHACK_PRIO.goldenTell, tell: true });
        return true;
      }
      case E_EMERGE: {
        // Splash droplets on the pop, dropped under the clutter governor.
        if (busy.current.size < 3 && G) fx.current?.burst('splash', G.cx[a], G.my[a] - 4, { count: 4, size: 0.7 });
        return true;
      }
      case E_HIT: {
        const h = a;
        const grade = b % 10;
        const k = Math.floor(b / 10);
        const pts = c;
        busy.current.delete(h);
        liveScore.current += pts;
        streak.current += 1;
        const step = Math.max(0, streak.current - TIER_AT[tier.current]) % 8;
        const fl = flurryHit(flurry.current, now, pts);
        const quiet = fl === FLURRY_GROW || (fl === FLURRY_START && flurry.current.hits > 2);
        const crowded = busy.current.size >= 3;
        const xy = holeXY(h);
        lastHit.current = { x: xy.x, y: xy.y, mult: multNow() };
        GameAudio.play(cues.swing, { volume: 0.2 });
        if (k === K_GOLDEN) {
          fireHit('golden', h, `GOLDEN! +${pts}`, step);
          GameAudio.play(cues.coinLayer, { volume: 0.8 });
          // 1.04 push-in toward the well during the 0.35x beat.
          if (camera && !reducedMotion && !party && G) {
            camera.lean((xy.x - G.w / 2) * 0.04, (xy.y - G.h / 2) * 0.04);
            camera.frame(1.04);
            setTimeout(() => { camera.frame(1); camera.lean(0, 0); }, 420);
          }
        } else if (grade === G_CRIT) {
          fireHit('crit', h, quiet ? undefined : `CRIT! +${pts}`, step);
          GameAudio.play(cues.bonk, { volume: 0.7 });
        } else if (grade === G_QUICK) fireHit(crowded ? 'quickLite' : 'quick', h, quiet ? undefined : `QUICK +${pts}`, step);
        else if (grade === G_GOOD) fireHit(crowded ? 'goodLite' : 'good', h, quiet ? undefined : `+${pts}`, step);
        else fireHit('late', h, quiet ? undefined : `+${pts}`, step);
        return true;
      }
      case E_BRUISER:
        liveScore.current += c;
        streak.current += 1;
        if (b <= 0) busy.current.delete(a);
        fireHit(b <= 0 ? 'crit' : 'good', a, b <= 0 ? `KNOCKOUT! +${c}` : `+${c}`, streak.current % 8);
        return true;
      case E_WHIFF:
        feel('whiff', { ...holeXY(a) });
        return true;
      case E_BUTTER:
        feel('butter', { ...holeXY(a), text: 'BUTTERFINGERS!' });
        return true;
      case E_DECOY:
        busy.current.delete(a);
        liveScore.current += c;
        fireHit('angler', a, `${c}`, 0);
        GameAudio.play(cues.nope, { volume: 0.7 });
        return true;
      case E_COIN_BUBBLE:
        busy.current.delete(a);
        liveScore.current += b;
        fireHit('coinBubble', a, `+${b}`, 0);
        return true;
      case E_ESCAPE:
        busy.current.delete(a);
        feel('escape', { ...holeXY(a) });
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
        if (G) feel('tierUp', { x: G.w / 2, y: 40, step: a - 1 });
        return true;
      case E_TIER_DROP:
        tier.current = a;
        streak.current = b;
        feel('tierDrop');
        return true;
      case E_BREAK:
        if (a >= 5) feel('comboBreak');
        streak.current = 0;
        tier.current = 0;
        return true;
      case E_FEVER_READY:
        if (G) feel('feverReady', { x: G.w / 2, y: G.hudH + 40, text: 'FEVER READY!' });
        onReadyRef.current?.();
        return true;
      case E_FEVER:
        if (a === 1) {
          onFeverRef.current?.(true);
          if (G) feel('fever', { x: G.w / 2, y: G.deckTop + (G.h - G.deckTop) * 0.3, text: 'FEVER!' });
        } else {
          onFeverRef.current?.(false);
          feel('feverEnd', G ? { x: G.w / 2, y: G.deckTop } : {});
        }
        return true;
      case E_FREEZE:
        GameAudio.play(cues.lookup, { volume: 0.5 });
        GameAudio.music.setState('muffled', 200);
        return true;
      case E_RESUME:
        playPattern('lookUpResume', { priority: WHACK_PRIO.flow });
        GameAudio.play(cues.resume, { volume: 0.6 });
        GameAudio.music.setState('open', 300);
        return true;
      case E_PUFF:
        feel('whiff', { ...holeXY(a) });
        GameAudio.play(cues.puff, { volume: 0.7 });
        return true;
      case E_HAT_BOUNCE:
        GameAudio.play(cues.hatBounce, { volume: 0.55 });
        playPattern('hatBounce', { priority: WHACK_PRIO.flow });
        return true;
      case E_WIN:
        return true;
      default:
        return false;
    }
  };

  // Combo slab (8.8): 300 ms after a 3+ hit flurry ends, a diagonal slab slams in at the last hit.
  useEffect(() => {
    const iv = setInterval(() => {
      const f = flurry.current;
      const hits = f.hits;
      const pts = f.points;
      if (flurryResolve(flurry.current, Date.now()) && hits >= 3) {
        const at = lastHit.current;
        const m = at.mult;
        const label = `${m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)}`;
        feel('combo', { x: at.x, y: at.y - 20, stamp: `x${label} COMBO +${pts}` });
      }
    }, 100);
    return () => clearInterval(iv);
  }, [feel]);

  const reset = useCallback((s: number) => {
    liveScore.current = 0;
    streak.current = s;
    flurry.current = createFlurry(900, 3);
    busy.current.clear();
  }, []);

  return {
    handle, fire: feel as unknown as WhackJuice['fire'], fireHit, holeXY, hud, liveScore, streak, tier, flurry, busy, reset,
  };
}

export { GOLD, CORAL, K_HELMET, K_TENTACLE, K_TWIN };
