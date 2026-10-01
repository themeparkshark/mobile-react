/**
 * Sharky feel director (design v7.1 sections 7, 8 and 9): turns one frame's
 * sim events into sound, haptics, particles and camera, all in the same JS
 * flush. Stamps, local freezes and the on-shark readouts already happened on
 * the UI thread (render/pres.ts); this is everything that needs JS.
 *
 * Haptic diet (9): only hit, Close Skim (Light then selection 50ms later),
 * Perfect, Chomp, Overdrive armed and start, tier up, Frenzy, gate, telegraphs,
 * control returning (pips, Float pop) and wipeout. Coins, lines, rings, plain
 * Skims, grazes, tokens, Boost fill, chain breaks, scatters, touches, bounces,
 * Float in and clock ticks are silent in the hand. The 'sharky' haptic bus
 * caps gameplay haptics at 4 per second (telegraphs exempt).
 */

import type { RefObject } from 'react';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { playHaptic } from '../../gamekit/Haptics';
import { forEachEvent } from '../../gamekit/core/eventRing';
import { tierCount } from '../../gamekit/core/perfTier';
import type { FxStageHandle } from '../../gamekit/fx/FxStage';
import type { CameraRig } from '../../gamekit/fx/useCamera';
import type { GameClockHandle } from '../../gamekit/useGameClock';
import {
  EV_BADGE, EV_BOUNCE, EV_CHAIN_BREAK, EV_CHAIN_TIER, EV_CHOMP, EV_CLOCK_TICK, EV_COIN, EV_DOOM, EV_DRAFT, EV_END,
  EV_FLOAT_IN, EV_FLOAT_POP, EV_FREEZE, EV_FRENZY_END, EV_FRENZY_START, EV_GATE, EV_GATE_BONUS, EV_GATE_NEAR,
  EV_GIFT_IN, EV_GIFT_POP, EV_GRAZE, EV_HIT, EV_LINE, EV_LINE_BOOST, EV_OD_ARMED, EV_OD_END, EV_OD_START, EV_PASS,
  EV_PIP, EV_POCKET_END, EV_PUFFER_WIGGLE, EV_REGRAB, EV_REVIVE, EV_RING, EV_RUSH, EV_SCATTER, EV_SCORE,
  EV_SHIELD_GET, EV_SHIELD_POP, EV_SKIM, EV_SPRINT, EV_TOKEN, EV_TOKEN_SET, EV_TORPEDO_LOCK, EV_TORPEDO_TRACK,
  EV_TOUCH, EV_WIPEOUT, E_PUFFER, G_SPLIT, IN_PRESS, IN_RELEASE,
} from './sim/core';
import { BR_CAM, BR_CAM2, BR_INPUT, BR_RIVAL, BR_RIVALPOS } from './useSharkyEngine';
import type { SharkyLayout } from './render/view';
import { REWARD } from './render/palette';

export interface FeelHooks {
  onScore: (score: number) => void;
  onGate: (bonusSteps: number, kind: number, step: number, gates: number) => void;
  onGateBonus: (pts: number, mult: number) => void;
  onPocketEnd: (sprint: number) => void;
  onFrenzy: (on: boolean) => void;
  onOverdrive: (on: boolean) => void;
  onFreeze: (on: boolean) => void;
  onFloat: (on: boolean) => void;
  onWipeout: () => void;
  onRevive: () => void;
  onEnd: (reason: number) => void;
  onRivalDone: (slot: number, reason: number, finishStep: number, score: number) => void;
  onSprint: (sprint: number) => void;
  onGateNear: () => void;
  /** Every frame: the player's distance, y and step (whispers). */
  onCam?: (du: number, y: number, step: number) => void;
  /** Rival position samples (slot, distance, y, step). */
  onRivalPos?: (slot: number, d: number, y: number, step: number) => void;
  /** Score position on screen (fly-to-score target). */
  scoreAt: () => { x: number; y: number };
  /** Token pip position on screen. */
  pipAt: (slot: number) => { x: number; y: number };
}

export interface FeelDeps {
  fx: RefObject<FxStageHandle | null>;
  camera: CameraRig;
  clock: GameClockHandle;
  layout: () => SharkyLayout;
  calm: boolean;
  /** Rally: never a timescale dip (design 7.0). */
  rally: () => boolean;
  /** Tide Gates passed (coin ladder key: k0, k2, k4). */
  gates: () => number;
  /** Perf quality tier (0 full, 1 lite, 2 min): scales particle counts. */
  quality?: () => number;
  hooks: FeelHooks;
}

function cue(...names: string[]): string {
  for (const n of names) if (GameAudio.hasCue(n)) return n;
  return names[names.length - 1];
}

export function createSharkyFeel(deps: FeelDeps) {
  const cam = { du: 0, anc: 158, y: 500, step: 0, camY: 0, zoom: 1 };
  let lastHit = 0;
  let lastBadge = 0;
  let coinPan = 1;
  let grazeVoice = -1;
  let grazeStarted = 0;
  let grazeClose = 0;
  let grazeStep = 0;
  let lastGrazeAt = 0;
  let lastRelease = 0;
  let lastBreach = 0;
  let prevY = 500;
  let skimStack = 0;
  let lastSkim = 0;
  let sparkTick = 0;
  const C = {
    coin: cue('coin_tick', 'fx.coin'),
    reveal: cue('chris_reveal', 'fx.reveal'),
    reward: cue('chris_reward', 'fx.reward'),
    ring: cue('sk_ring', 'fx.reveal'),
    perfect: cue('sk_ring_perfect', 'fx.reveal'),
    skim: cue('sk_skim', 'fx.whoosh'),
    glint: cue('sk_close_glint', 'fx.reveal'),
    chomp: cue('sh_chomp', 'fx.hit'),
    boostReady: cue('sk_boost_ready', 'ui.select'),
    odStart: cue('sk_overdrive_start', 'sk_dash', 'fx.whoosh'),
    hit: cue('sk_bump', 'fx.hit'),
    scatter: cue('sk_scatter_jingle', 'fx.nopeShort'),
    shieldPop: cue('sh_shield_pop', 'fx.hit'),
    chainUp: cue('sk_chain_up', 'fx.reveal'),
    chainBreak: cue('sh_combo_break', 'fx.nopeShort'),
    feverStart: cue('sh_fever_start', 'fx.reveal'),
    feverEnd: cue('sh_fever_end', 'fx.whoosh'),
    pop: cue('sh_bubble_pop', 'fx.hit'),
    gate: cue('sk_tide_gate', 'fx.reward'),
    gateBonus: cue('sk_gate_bonus', 'chris_reward', 'fx.reward'),
    riser: cue('sk_gate_rush_riser_chris', 'sk_gate_rush_riser', 'fx.whoosh'),
    pip: cue('chris_pip', 'ui.select'),
    torpedo: cue('sk_torpedo_warn', 'ui.select'),
    puff: cue('sh_puff_inflate', 'ui.select'),
    floatIn: cue('sk_float_in', 'fx.whoosh'),
    doom: cue('sk_doom_whoosh', 'fx.whoosh'),
    wipeout: cue('sk_wipeout', 'fx.nopeShort'),
    nope: cue('chris_nope', 'fx.nopeShort'),
    rescue: cue('sk_rescue_bubble', 'fx.reward'),
    tick: cue('ui_tick', 'ui.select'),
    powerup: cue('sh_powerup', 'fx.reveal'),
    lineBoost: cue('sk_boost', 'fx.whoosh'),
    pass: cue('sk_pass', 'sk_pass_whoosh', 'fx.whoosh'),
    graze: cue('sk_graze', 'sk_graze_loop'),
    wake: cue('sk_wake_wave', 'fx.whoosh'),
    stroke: cue('sk_swim_stroke', 'ui.tap'),
    breachUp: cue('sk_surface_breach_up', 'sk_float_in'),
    breachDown: cue('sk_surface_breach_down', 'sk_float_in'),
  };
  const coinCue = (star: boolean): string => {
    const g = deps.gates();
    const k = g >= 2 ? 'k4' : g === 1 ? 'k2' : 'k0';
    const name = star ? `sk_coin_${k}_f` : `sk_coin_${k}`;
    return GameAudio.hasCue(name) ? name : C.coin;
  };

  // World (view u) -> field points, through the camera group (offset, y follow, zoom about the shark).
  const pos = (x: number, y: number) => {
    const L = deps.layout();
    const vx = cam.anc + (x - cam.du);
    const zx = cam.anc + (vx - cam.anc) * cam.zoom;
    const zy = cam.y + (y - cam.y) * cam.zoom;
    return { x: L.offX + zx * L.k, y: L.offY + (zy + cam.camY) * L.k };
  };
  const sharkPos = () => pos(cam.du, cam.y);

  const scaled = (raw: FxStageHandle | null): FxStageHandle | null => {
    const q = deps.quality ? deps.quality() : 0;
    if (!raw || q <= 0) return raw;
    return {
      ...raw,
      burst: (name, x, y, params) => raw.burst(name, x, y, params && params.count ? { ...params, count: tierCount(q, params.count) } : params),
    };
  };
  const toScore = (fx: FxStageHandle | null, text: string, x: number, y: number, size: 'sm' | 'md' | 'lg' | 'xl' = 'sm') => {
    fx?.flyUp(text, x, y, { size, color: REWARD, to: deps.hooks.scoreAt(), holdMs: 120, travelMs: 320 });
  };
  const stopGraze = () => {
    if (grazeVoice >= 0) GameAudio.stop(grazeVoice);
    grazeVoice = -1;
    grazeStarted = 0;
    grazeClose = 0;
    grazeStep = 0;
  };

  const handle = (batch: number[]) => {
    const fx = scaled(deps.fx.current);
    const { camera, clock, hooks } = deps;
    const now = Date.now();
    let grazedThisBatch = false;
    forEachEvent(batch, (kind, a, b, c, d) => {
      switch (kind) {
        case BR_CAM:
          cam.du = a;
          cam.anc = b;
          cam.y = c;
          cam.step = d;
          hooks.onCam?.(a, c, d);
          // Surface breach (8.3): crossing y 90, 400ms cooldown.
          if (now - lastBreach > 400 && ((prevY > 90 && c <= 90) || (prevY <= 90 && c > 90))) {
            lastBreach = now;
            GameAudio.play(c <= 90 ? C.breachUp : C.breachDown, { volume: 0.7 });
          }
          prevY = c;
          break;
        case BR_CAM2:
          cam.camY = a / 10;
          cam.zoom = b / 1000;
          break;
        case BR_INPUT:
          if (a === IN_PRESS && now - lastRelease > 300) GameAudio.play(C.stroke, { volume: 0.55 });
          if (a === IN_RELEASE) lastRelease = now;
          break;
        case BR_RIVALPOS:
          hooks.onRivalPos?.(a, b, c, d);
          break;
        case BR_RIVAL:
          hooks.onRivalDone(a, b, c, d);
          break;
        case EV_SCORE:
          hooks.onScore(a);
          break;
        case EV_COIN: {
          const p = pos(a, b);
          coinPan = -coinPan;
          GameAudio.playLadder(coinCue((d & 2) !== 0), Math.min(12, c), { pan: 0.15 * coinPan });
          fx?.burst('sparkles', p.x, p.y, { count: 2 });
          break;
        }
        case EV_LINE: {
          const p = pos(a, b);
          GameAudio.playLadder(coinCue(false), 12);
          GameAudio.play(C.reveal, { volume: 0.7 });
          fx?.burst('sparkles', p.x, p.y, { count: 6 });
          toScore(fx, '+30', p.x, p.y - 16);
          break;
        }
        case EV_RING: {
          const p = pos(a, b);
          if (c) {
            // Perfect ring (big moment 2): the freeze, flash and shockwave are on the UI thread.
            GameAudio.play(C.perfect);
            playHaptic([{ at: 0, p: 'medium' }]);
            fx?.burst('confetti', p.x, p.y, { count: 16 });
            fx?.burst('impact', p.x, p.y, { count: 1 });
            if (!deps.calm) {
              camera.punch(0.03, 80);
              camera.shake(0.1);
            }
            toScore(fx, '+120', p.x, p.y - 30, 'md');
          } else {
            GameAudio.play(C.ring);
            fx?.ring(p.x, p.y, { color: REWARD, from: 14, to: 46, ms: 220 });
            fx?.burst('confetti', p.x, p.y, { count: 8 });
            toScore(fx, '+50', p.x, p.y - 30);
          }
          break;
        }
        case EV_GRAZE: {
          // Sparks stream along the hazard edge: every 2 steps in the halo, every step Close.
          grazedThisBatch = true;
          lastGrazeAt = now;
          sparkTick++;
          const close = a === 1;
          if (close || sparkTick % 2 === 0) {
            const p = sharkPos();
            const up = c < cam.y ? 0 : 1;
            void up;
            fx?.burst('sparks', p.x + 30, p.y + (c < 500 ? -24 : 24), { count: 1, angle: 180, spread: 30, speed: 0.8 });
          }
          if (close) grazeClose++;
          if (grazeVoice < 0) {
            grazeStarted = now;
            grazeStep = 0;
            grazeVoice = GameAudio.playLadder(C.graze, 0, { volume: 0.55 });
          } else if (close && grazeClose >= 4 && grazeStep < 3) {
            grazeClose = 0;
            grazeStep++;
            GameAudio.stop(grazeVoice);
            grazeVoice = GameAudio.playLadder(C.graze, grazeStep, { volume: 0.55 });
          } else if (now - grazeStarted > 900) {
            grazeStarted = now;
            grazeVoice = GameAudio.playLadder(C.graze, grazeStep, { volume: 0.55 });
          }
          break;
        }
        case EV_SKIM: {
          const p = sharkPos();
          stopGraze();
          skimStack = now - lastSkim < 1000 ? Math.min(4, skimStack + 1) : 1;
          lastSkim = now;
          if (c === 1) {
            // Close Skim confirmed: glint, duck, the double tick, burst, punch, dip.
            GameAudio.playLadder(C.skim, 3);
            GameAudio.play(C.glint);
            GameAudio.duck(4, 20, 140, 120);
            playHaptic([{ at: 0, p: 'light' }, { at: 50, p: 'selection' }]);
            fx?.burst('stars', p.x + 40, p.y, { count: 6, speed: 1.2 });
            if (!deps.calm) {
              camera.punch(0.025, 45);
              if (!deps.rally()) clock.slowMo(0.85, 120, 60);
            }
            toScore(fx, 'x2', p.x + 30, p.y - 40);
          } else {
            GameAudio.playLadder(C.skim, Math.max(0, skimStack - 1));
          }
          break;
        }
        case EV_PASS: {
          // Doppler pass above 450 u/s: a band by speed, panned right to left.
          if (b >= 450) GameAudio.playLadder(C.pass, b >= 530 ? 2 : b >= 490 ? 1 : 0, { volume: 0.6 });
          break;
        }
        case EV_CHOMP: {
          const p = pos(a, b);
          GameAudio.play(C.chomp);
          playHaptic([{ at: 0, p: 'rigid' }]);
          fx?.burst('impact', p.x, p.y, { count: 1 });
          fx?.burst('confetti', p.x, p.y, { count: 10 });
          if (c === E_PUFFER) fx?.burst('bubbles', p.x, p.y, { count: 8 });
          if (!deps.calm) camera.shake(0.15);
          toScore(fx, `+${d}`, p.x, p.y - 34, 'md');
          break;
        }
        case EV_TOKEN: {
          const p = pos(a, b);
          GameAudio.play(C.reveal);
          const pip = hooks.pipAt(c);
          fx?.burst('coins', p.x, p.y, { count: 6, tx: pip.x, ty: pip.y, magnetDelay: 0.05, magnetDur: 0.4 });
          fx?.burst('sparkles', p.x, p.y, { count: 12 });
          break;
        }
        case EV_TOKEN_SET: {
          const s = sharkPos();
          GameAudio.play(C.reward);
          GameAudio.play(C.perfect, { delayMs: 90 });
          fx?.burst('confetti', s.x, s.y, { count: 24 });
          toScore(fx, '+500', s.x, s.y - 60, 'lg');
          break;
        }
        case EV_OD_ARMED: {
          const s = sharkPos();
          GameAudio.play(C.boostReady);
          playHaptic([{ at: 0, p: 'soft' }]);
          fx?.burst('sparkles', s.x, s.y, { count: 6 });
          break;
        }
        case EV_OD_START: {
          const s = sharkPos();
          GameAudio.play(C.odStart);
          playHaptic([{ at: 0, p: 'heavy' }]);
          fx?.burst('impact', s.x + 20, s.y, { count: 1, size: 1.4 });
          fx?.burst('speedLines', s.x + 40, s.y, { count: 10 });
          hooks.onOverdrive(true);
          break;
        }
        case EV_OD_END:
          GameAudio.play(C.feverEnd, { volume: 0.5 });
          hooks.onOverdrive(false);
          break;
        case EV_HIT: {
          const p = pos(a, b);
          stopGraze();
          GameAudio.play(C.hit);
          if (now - lastHit > 90) playHaptic([{ at: 0, p: 'heavy' }], { priority: 9 });
          lastHit = now;
          clock.hitStop(70, { force: true });
          GameAudio.duck(4, 20, 180, 200);
          fx?.burst('impact', p.x + 30, p.y, { count: 1 });
          fx?.burst('bubbles', p.x, p.y, { count: 8 });
          if (!deps.calm) camera.shake(0.55, -1, 0);
          break;
        }
        case EV_SCATTER:
          GameAudio.play(C.scatter);
          break;
        case EV_REGRAB: {
          const p = pos(a, b);
          GameAudio.playLadder(coinCue(false), 12);
          fx?.burst('glints', p.x, p.y, { count: 6 });
          break;
        }
        case EV_SHIELD_POP: {
          const p = pos(a, b);
          GameAudio.play(C.shieldPop);
          playHaptic([{ at: 0, p: 'medium' }]);
          fx?.burst('bubbles', p.x, p.y, { count: 12 });
          fx?.burst('shards', p.x, p.y, { count: 6 });
          break;
        }
        case EV_SHIELD_GET: {
          GameAudio.play(C.powerup);
          break;
        }
        case EV_CHAIN_TIER:
          GameAudio.playLadder(C.chainUp, Math.max(0, Math.min(3, a - 1)));
          playHaptic([{ at: 0, p: 'selection' }]);
          break;
        case EV_CHAIN_BREAK:
          if (b >= 3) {
            GameAudio.play(C.chainBreak, { volume: 0.8 });
            GameAudio.duck(6, 30, 300, 200);
          }
          break;
        case EV_FRENZY_START: {
          // Big moment 1: the ring wipe and the grade are on the UI thread.
          const s = sharkPos();
          const L = deps.layout();
          GameAudio.play(C.feverStart);
          GameAudio.duck(4, 20, 180, 200);
          playHaptic([{ at: 0, p: 'heavy' }, { at: 90, p: 'medium' }], { priority: 9 });
          const span = Math.hypot(Math.max(s.x, L.w - s.x), Math.max(s.y, L.h - s.y));
          fx?.ring(s.x, s.y, { color: REWARD, from: 20, to: span, ms: 280 });
          setTimeout(() => {
            fx?.burst('impact', s.x, s.y, { count: 1, size: 1.5 });
            fx?.burst('confetti', s.x, s.y, { count: 30 });
            if (!deps.calm) camera.punch(0.06, 90);
          }, 90);
          hooks.onFrenzy(true);
          break;
        }
        case EV_FRENZY_END:
          GameAudio.play(C.feverEnd, { volume: 0.7 });
          hooks.onFrenzy(false);
          break;
        case EV_BOUNCE: {
          const p = pos(b, a === 0 ? 40 : 960);
          if (a === 0) fx?.burst('splash', p.x, p.y, { count: 10 });
          else fx?.burst('puff', p.x, p.y, { count: 6 });
          GameAudio.play(C.pop, { volume: 0.7 });
          if (!deps.calm) camera.shake(0.15);
          break;
        }
        case EV_TOUCH: {
          const p = pos(b, a === 0 ? 40 : 960);
          if (a === 0) fx?.burst('splash', p.x, p.y, { count: 4, size: 0.7 });
          else fx?.burst('puff', p.x, p.y, { count: 3, size: 0.7 });
          GameAudio.play(C.pop, { volume: 0.3 });
          break;
        }
        case EV_RUSH:
          GameAudio.play(C.riser, { volume: 0.8 });
          GameAudio.duck(3, 200, 1800, 400);
          break;
        case EV_GATE: {
          const s = sharkPos();
          stopGraze();
          if (b === G_SPLIT) {
            GameAudio.play(C.reveal, { volume: 0.8 });
          } else {
            GameAudio.play(C.gate);
            playHaptic([{ at: 0, p: 'success' }]);
            fx?.burst('confetti', s.x + 60, s.y, { count: 30 });
            if (!deps.calm) camera.punch(0.06, 150);
          }
          hooks.onGate(a, b, c, d);
          break;
        }
        case EV_GATE_BONUS: {
          // The chain badge detaches and flies to the score as a gold number;
          // a coin fountain arcs out of the gate bulbs into the shark.
          const s = sharkPos();
          const tier = b >= 6 ? 3 : b >= 4 ? 2 : b >= 2 ? 1 : 0;
          GameAudio.playLadder(C.gateBonus, tier);
          fx?.flyUp(`+${a}`, s.x - 30, s.y - 70, { size: 'xl', color: REWARD, to: hooks.scoreAt(), holdMs: 120, travelMs: 450 });
          fx?.burst('sparkles', s.x - 30, s.y - 70, { count: 10 });
          setTimeout(() => {
            const p2 = sharkPos();
            fx?.burst('coins', p2.x + 120, p2.y - 160, { count: 6, tx: p2.x, ty: p2.y, magnetDelay: 0.25, magnetDur: 0.35 });
            for (let k = 0; k < 6; k++) GameAudio.playLadder(coinCue(false), 7 + k, { delayMs: 260 + k * 70 });
          }, 120);
          hooks.onGateBonus(a, b);
          break;
        }
        case EV_PIP:
          GameAudio.play(C.pip, { pitch: a === 3 ? 5 : 0 });
          playHaptic([{ at: 0, p: 'selection' }]);
          break;
        case EV_POCKET_END:
          hooks.onPocketEnd(a);
          break;
        case EV_SPRINT:
          hooks.onSprint(a);
          break;
        case EV_BADGE:
          if (now - lastBadge > 250) {
            playHaptic([{ at: 0, p: 'light' }], { tell: true });
            lastBadge = now;
          }
          break;
        case EV_TORPEDO_TRACK:
          GameAudio.play(C.torpedo);
          playHaptic([{ at: 0, p: 'warning' }], { tell: true });
          break;
        case EV_TORPEDO_LOCK:
          GameAudio.play(C.torpedo, { pitch: 3 });
          playHaptic([{ at: 0, p: 'medium' }], { tell: true });
          break;
        case EV_PUFFER_WIGGLE:
          GameAudio.play(C.puff, { volume: 0.8 });
          playHaptic([{ at: 0, p: 'light' }], { tell: true });
          break;
        case EV_FLOAT_IN:
          stopGraze();
          GameAudio.play(C.floatIn, { volume: 0.8 });
          hooks.onFloat(true);
          break;
        case EV_FLOAT_POP: {
          const p = pos(a, b);
          GameAudio.play(C.pop);
          playHaptic([{ at: 0, p: 'selection' }]);
          fx?.burst('bubbles', p.x, p.y, { count: 10 });
          hooks.onFloat(false);
          hooks.onFreeze(false);
          break;
        }
        case EV_FREEZE:
          GameAudio.duck(10, 200, 60000, 300);
          hooks.onFreeze(true);
          break;
        case EV_DOOM:
          GameAudio.play(C.doom);
          clock.slowMo(0.4, 300, 120, true);
          if (!deps.calm) camera.punch(0.06, 120);
          break;
        case EV_GATE_NEAR:
          hooks.onGateNear();
          break;
        case EV_WIPEOUT: {
          const p = pos(a, b);
          stopGraze();
          GameAudio.play(C.wipeout);
          GameAudio.play(C.nope, { volume: 0.6, delayMs: 120 });
          playHaptic([{ at: 0, p: 'error' }], { priority: 9 });
          clock.hitStop(160, { force: true });
          fx?.burst('bubbles', p.x, p.y, { count: 30 });
          if (!deps.calm) camera.punch(0.12, 200);
          hooks.onWipeout();
          break;
        }
        case EV_REVIVE: {
          const s = sharkPos();
          GameAudio.play(C.rescue);
          playHaptic([{ at: 0, p: 'success' }]);
          fx?.burst('bubbles', s.x, s.y, { count: 16 });
          hooks.onRevive();
          break;
        }
        case EV_CLOCK_TICK:
          GameAudio.play(C.tick, { volume: 0.8 });
          break;
        case EV_LINE_BOOST:
          GameAudio.play(C.lineBoost, { volume: 0.7 });
          break;
        case EV_GIFT_IN:
          GameAudio.play(C.wake, { volume: 0.8 });
          playHaptic([{ at: 0, p: 'selection' }]);
          break;
        case EV_GIFT_POP: {
          const p = pos(a, b);
          GameAudio.play(C.pip, { pitch: 5 });
          fx?.burst('bubbles', p.x, p.y, { count: 10 });
          break;
        }
        case EV_DRAFT: {
          const s = sharkPos();
          if (a === 1) fx?.burst('speedLines', s.x + 40, s.y, { count: 6 });
          break;
        }
        case EV_END:
          stopGraze();
          hooks.onEnd(a);
          break;
        default:
          break;
      }
    });
    // The graze tone fades out at pass end (no graze event this frame for 120ms).
    if (!grazedThisBatch && grazeVoice >= 0 && now - lastGrazeAt > 120) stopGraze();
  };

  return { handle, cam };
}
