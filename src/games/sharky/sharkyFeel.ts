/**
 * Sharky feel director: turns one frame's sim events into sound, haptics,
 * FX, camera and time effects, all in the same JS flush (design 8.3 / 7.3 /
 * 7.4). Haptics never wait on audio; telegraph haptics outrank reactions.
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
  EV_BADGE, EV_BOOST_SEG, EV_BOUNCE, EV_CHAIN_BREAK, EV_CHAIN_TIER, EV_CHOMP, EV_CLOCK_TICK, EV_COIN, EV_DASH,
  EV_DOOM, EV_DRAFT, EV_END, EV_FIZZ, EV_FLOAT_IN, EV_FLOAT_POP, EV_FREEZE, EV_FRENZY_END, EV_FRENZY_START, EV_GATE,
  EV_GATE_NEAR, EV_HIT, EV_LINE, EV_LINE_BOOST, EV_PIP, EV_POCKET_END, EV_PUFFER_WIGGLE, EV_REGAIN, EV_REVIVE, EV_RING,
  EV_SCATTER, EV_SCORE, EV_SHIELD_GET, EV_SHIELD_POP, EV_SKIM, EV_SPEED_BOOST, EV_SPRINT, EV_TOKEN, EV_TOKEN_SET,
  EV_TORPEDO_LOCK, EV_TORPEDO_TRACK, EV_WIPEOUT, G_SPLIT, E_PUFFER,
} from './sim/core';
import { BR_CAM, BR_RIVAL, BR_RIVALPOS } from './useSharkyEngine';
import type { SharkyLayout } from './render/view';

const GOLD = '#ffc233';
const CORAL = '#ff6b57';
const SKY = '#5fd0ff';

export interface FeelHooks {
  onScore: (score: number, pot: number) => void;
  onGate: (bonusMs: number, kind: number, step: number, gates: number) => void;
  onPocketEnd: (sprint: number) => void;
  onFrenzy: (on: boolean) => void;
  onFreeze: (on: boolean) => void;
  onWipeout: () => void;
  onRevive: () => void;
  onEnd: (reason: number) => void;
  onRivalDone: (slot: number, reason: number, finishStep: number, score: number) => void;
  onSprint: (sprint: number) => void;
  onGateNear: () => void;
  /** Every frame: the player's distance, y and step (whispers, overtakes). */
  onCam?: (du: number, y: number, step: number) => void;
  /** Rival position samples (slot, distance, y, step). */
  onRivalPos?: (slot: number, d: number, y: number, step: number) => void;
}

export interface FeelDeps {
  fx: RefObject<FxStageHandle | null>;
  camera: CameraRig;
  clock: GameClockHandle;
  layout: () => SharkyLayout;
  calm: boolean;
  tier: () => number;
  /** Perf quality tier (0 full, 1 lite, 2 min): scales particle counts. */
  quality?: () => number;
  hooks: FeelHooks;
}

function cue(...names: string[]): string {
  for (const n of names) if (GameAudio.hasCue(n)) return n;
  return names[names.length - 1];
}

export function createSharkyFeel(deps: FeelDeps) {
  const cam = { du: 0, anc: 250, y: 500, step: 0 };
  let lastBadge = 0;
  let lastHit = 0;
  const C = {
    coin: cue('coin_tick', 'fx.coin'),
    ring: cue('sk_ring', 'fx.reveal'),
    perfect: cue('sk_ring_perfect', 'fx.reveal'),
    skim: cue('sk_skim', 'fx.whoosh'),
    chomp: cue('sh_chomp', 'fx.hit'),
    boostReady: cue('sk_boost_ready', 'ui.select'),
    dash: cue('sk_dash', 'fx.whoosh'),
    fizz: cue('sk_dash_fizz', 'fx.nopeShort'),
    hit: cue('sk_bump', 'fx.hit'),
    shieldPop: cue('sh_shield_pop', 'fx.hit'),
    chainUp: cue('sk_chain_up', 'fx.reveal'),
    chainBreak: cue('sh_combo_break', 'fx.nopeShort'),
    feverStart: cue('sh_fever_start', 'fx.reveal'),
    feverEnd: cue('sh_fever_end', 'fx.whoosh'),
    splash: cue('sh_splash_s', 'fx.whoosh'),
    gate: cue('sk_tide_gate', 'fx.reward'),
    pip: cue('chris.pip', 'ui.select'),
    torpedo: cue('sk_torpedo_warn', 'ui.select'),
    puff: cue('sh_puff_inflate', 'ui.select'),
    floatIn: cue('sk_float_in', 'fx.whoosh'),
    pop: cue('sh_bubble_pop', 'fx.hit'),
    doom: cue('sk_doom_whoosh', 'fx.whoosh'),
    wipeout: cue('sk_wipeout', 'fx.nopeShort'),
    nope: cue('fx.nopeShort'),
    rescue: cue('sk_rescue_bubble', 'fx.reward'),
    tick: cue('ui_tick', 'ui.select'),
    powerup: cue('sh_powerup', 'fx.reveal'),
    lineBoost: cue('sk_boost', 'fx.whoosh'),
    reveal: cue('fx.reveal'),
    reward: cue('fx.reward'),
    pass: cue('sk_pass_whoosh', 'fx.whoosh'),
  };

  const pos = (x: number, y: number) => {
    const L = deps.layout();
    const vx = cam.anc + (x - cam.du);
    const follow = deps.calm ? 0 : (500 - cam.y) * 0.06;
    return { x: L.offX + vx * L.k, y: L.offY + (y + follow) * L.k };
  };
  const sharkPos = () => pos(cam.du, cam.y);

  // Particle budgets follow the perf tier; everything else (rings, text, flashes) is unchanged.
  const scaled = (raw: FxStageHandle | null): FxStageHandle | null => {
    const q = deps.quality ? deps.quality() : 0;
    if (!raw || q <= 0) return raw;
    return {
      ...raw,
      burst: (name, x, y, params) => raw.burst(name, x, y, params && params.count ? { ...params, count: tierCount(q, params.count) } : params),
    };
  };

  const handle = (batch: number[]) => {
    const fx = scaled(deps.fx.current);
    const { camera, clock, hooks } = deps;
    forEachEvent(batch, (kind, a, b, c, d) => {
      switch (kind) {
        case BR_CAM:
          cam.du = a;
          cam.anc = b;
          cam.y = c;
          cam.step = d;
          hooks.onCam?.(a, c, d);
          break;
        case BR_RIVALPOS:
          hooks.onRivalPos?.(a, b, c, d);
          break;
        case BR_RIVAL:
          hooks.onRivalDone(a, b, c, d);
          break;
        case EV_SCORE:
          hooks.onScore(a, b);
          break;
        case EV_COIN: {
          const p = pos(a, b);
          GameAudio.playLadder(C.coin, Math.min(12, c));
          fx?.burst('sparkles', p.x, p.y, { count: 2 });
          break;
        }
        case EV_REGAIN: {
          const p = pos(a, b);
          fx?.burst('glints', p.x, p.y, { count: 4 });
          break;
        }
        case EV_LINE: {
          const p = pos(a, b);
          GameAudio.playLadder(C.coin, 12);
          playHaptic('tick');
          fx?.burst('sparkles', p.x, p.y, { count: 6 });
          fx?.flyUp('LINE!', p.x, p.y - 20, { size: 'sm', color: GOLD, rise: 30, ms: 450 });
          break;
        }
        case EV_RING: {
          const p = pos(a, b);
          if (c) {
            GameAudio.play(C.perfect);
            playHaptic('goodHit');
            fx?.ring(p.x, p.y, { color: '#ffffff', from: 12, to: 60, ms: 220 });
            fx?.burst('confetti', p.x, p.y, { count: 16 });
            fx?.burst('impact', p.x, p.y, { count: 1 });
            fx?.flyUp('PERFECT +100', p.x, p.y - 30, { size: 'lg', color: GOLD });
            if (!deps.calm) camera.punch(0.02);
          } else {
            GameAudio.play(C.ring);
            playHaptic('tap');
            fx?.burst('confetti', p.x, p.y, { count: 8 });
            fx?.flyUp('+50', p.x, p.y - 30, { size: 'sm', color: GOLD });
          }
          break;
        }
        case EV_SKIM: {
          const p = pos(a, b);
          const stack = c;
          GameAudio.play(C.skim, { pitch: [0, 2, 4, 5][Math.min(3, stack - 1)] });
          playHaptic('tick');
          fx?.burst('sparks', p.x + 20, p.y, { count: 6 });
          fx?.burst('sparkles', p.x, p.y, { count: 4 });
          if (deps.tier() >= 2) fx?.flyUp(stack > 1 ? `SKIM x${stack}` : 'SKIM', p.x, p.y - 44, { size: 'md', color: SKY, key: 'skim' });
          if (!deps.calm) camera.punch(0.005 + 0.005 * Math.min(3, stack));
          break;
        }
        case EV_CHOMP: {
          const p = pos(a, b);
          GameAudio.play(C.chomp);
          playHaptic('quickHit');
          clock.hitStop(40, { holdSim: true });
          fx?.burst('impact', p.x, p.y, { count: 1 });
          fx?.burst('confetti', p.x, p.y, { count: 10 });
          fx?.flyUp(`CHOMP +${d}`, p.x, p.y - 36, { size: 'md', color: GOLD });
          if (!deps.calm) camera.kick(4, 0);
          if (c === E_PUFFER) fx?.burst('bubbles', p.x, p.y, { count: 8 });
          break;
        }
        case EV_TOKEN: {
          const p = pos(a, b);
          GameAudio.play(C.reveal);
          playHaptic('goodHit');
          fx?.burst('sparkles', p.x, p.y, { count: 8 });
          fx?.flyUp(`TOKEN ${d}/3`, p.x, p.y - 40, { size: 'lg', color: GOLD });
          break;
        }
        case EV_TOKEN_SET: {
          const s = sharkPos();
          GameAudio.play(C.reward);
          GameAudio.play(C.perfect, { delayMs: 90 });
          playHaptic('win');
          fx?.burst('confetti', s.x, s.y, { count: 24 });
          fx?.flyUp('SET BONUS +500', s.x, s.y - 70, { size: 'xl', color: GOLD });
          break;
        }
        case EV_BOOST_SEG:
          GameAudio.play(C.boostReady, { volume: 0.8 });
          playHaptic('tick');
          break;
        case EV_DASH: {
          const s = sharkPos();
          GameAudio.play(C.dash);
          playHaptic('tap');
          fx?.burst('speedLines', s.x + 30, s.y, { count: 10 });
          fx?.burst('bubbles', s.x - 40, s.y, { count: 6 });
          if (!deps.calm) camera.punch(-0.02);
          break;
        }
        case EV_FIZZ: {
          const s = sharkPos();
          GameAudio.play(C.fizz, { volume: 0.7 });
          fx?.burst('puff', s.x - 50, s.y, { count: 3 });
          break;
        }
        case EV_HIT: {
          const now = Date.now();
          const p = pos(a, b);
          GameAudio.play(C.hit);
          if (now - lastHit > 90) playHaptic('hurt', { priority: 4 });
          lastHit = now;
          clock.hitStop(70, { holdSim: true, force: true });
          GameAudio.duck(4, 20, 180, 200);
          fx?.burst('impact', p.x + 30, p.y, { count: 1 });
          fx?.burst('bubbles', p.x, p.y, { count: 8 });
          fx?.vignette({ color: CORAL, peak: 0.2, inMs: 30, holdMs: 60, outMs: 140 });
          if (!deps.calm) camera.shake(0.45, -1, 0);
          break;
        }
        case EV_SCATTER: {
          const p = pos(b, c);
          fx?.flyUp(`-${a * 10}`, p.x, p.y - 50, { size: 'sm', color: '#ffffff' });
          break;
        }
        case EV_SHIELD_POP: {
          const p = pos(a, b);
          GameAudio.play(C.shieldPop);
          playHaptic('lateHit');
          fx?.burst('bubbles', p.x, p.y, { count: 12 });
          fx?.burst('shards', p.x, p.y, { count: 6 });
          if (!deps.calm) camera.shake(0.2);
          break;
        }
        case EV_SHIELD_GET: {
          const p = pos(a, b);
          GameAudio.play(C.powerup);
          playHaptic('goodHit');
          fx?.flyUp('BUBBLE SHIELD', p.x, p.y - 50, { size: 'md', color: '#ffffff' });
          break;
        }
        case EV_CHAIN_TIER: {
          GameAudio.playLadder(C.chainUp, Math.max(0, Math.min(3, a - 1)));
          playHaptic('tick');
          break;
        }
        case EV_CHAIN_BREAK: {
          if (b >= 3) {
            GameAudio.play(C.chainBreak, { volume: 0.8 });
            GameAudio.duck(6, 30, 300, 200);
            playHaptic('tap');
            const L = deps.layout();
            fx?.burst('shards', L.w / 2, L.skyH * 0.5 + 30, { count: 4 });
          }
          break;
        }
        case EV_FRENZY_START: {
          const s = sharkPos();
          GameAudio.play(C.feverStart);
          playHaptic('feverStart');
          // Gold ring wipe from the shark (design 7.3): never a white full-screen flash.
          const span = Math.hypot(Math.max(s.x, deps.layout().w - s.x), Math.max(s.y, deps.layout().h - s.y));
          fx?.ring(s.x, s.y, { color: GOLD, from: 20, to: span, ms: 280 });
          fx?.ring(s.x, s.y, { color: '#ffffff', from: 10, to: span * 0.6, ms: 240 });
          fx?.bloom(s.x, s.y, { color: GOLD, radius: 160, peak: 0.45, ms: 320 });
          fx?.burst('impact', s.x, s.y, { count: 1, size: 1.5 });
          fx?.burst('confetti', s.x, s.y, { count: 30 });
          fx?.flyUp('FRENZY!', deps.layout().w / 2, s.y - 90, { size: 'xl', color: GOLD, ms: 1200 });
          fx?.vignette({ color: GOLD, peak: 0.35, inMs: 120, holdMs: 5600, outMs: 300 });
          if (!deps.calm) camera.punch(0.06);
          hooks.onFrenzy(true);
          break;
        }
        case EV_FRENZY_END: {
          hooks.onFrenzy(false);
          fx?.vignette({ color: GOLD, peak: 0.001, inMs: 1, holdMs: 1, outMs: 1 });
          if (a > 0) {
            const s = sharkPos();
            GameAudio.play(C.reward, { volume: 0.8 });
            playHaptic('tick');
            fx?.burst('sparkles', s.x, s.y - 60, { count: 12 });
            fx?.flyUp(`BANKED +${a}`, s.x, s.y - 80, { size: 'lg', color: GOLD });
          } else {
            GameAudio.play(C.feverEnd, { volume: 0.7 });
          }
          break;
        }
        case EV_BOUNCE: {
          const L = deps.layout();
          const p = pos(b, a === 0 ? 40 : 960);
          if (a === 0) fx?.burst('splash', p.x, p.y, { count: 8 });
          else fx?.burst('puff', p.x, p.y, { count: 5 });
          GameAudio.play(C.splash, { volume: 0.55 });
          void L;
          break;
        }
        case EV_GATE: {
          const s = sharkPos();
          if (b === G_SPLIT) {
            GameAudio.play(C.reveal, { volume: 0.8 });
            playHaptic('tick');
          } else {
            GameAudio.play(C.gate);
            playHaptic('win');
            fx?.burst('confetti', s.x + 60, s.y, { count: 30 });
            if (a > 0) fx?.flyUp(`+${Math.round(a / 60)}s`, s.x, s.y - 70, { size: 'xl', color: GOLD, ms: 700 });
            if (!deps.calm) camera.punch(0.06);
          }
          hooks.onGate(a, b, c, d);
          break;
        }
        case EV_PIP:
          GameAudio.play(C.pip, { pitch: a === 3 ? 5 : 0 });
          playHaptic('tick');
          break;
        case EV_POCKET_END:
          hooks.onPocketEnd(a);
          break;
        case EV_SPRINT:
          hooks.onSprint(a);
          break;
        case EV_BADGE: {
          const now = Date.now();
          if (now - lastBadge > 250) {
            playHaptic('tap', { tell: true, priority: 3 });
            lastBadge = now;
          }
          break;
        }
        case EV_TORPEDO_TRACK:
          GameAudio.play(C.torpedo);
          playHaptic('incoming', { tell: true, priority: 3 });
          break;
        case EV_TORPEDO_LOCK:
          GameAudio.play(C.torpedo, { pitch: 3 });
          playHaptic('goodHit', { tell: true, priority: 3 });
          break;
        case EV_PUFFER_WIGGLE:
          GameAudio.play(C.puff, { volume: 0.8 });
          playHaptic('tap', { tell: true, priority: 3 });
          break;
        case EV_FLOAT_IN: {
          GameAudio.play(C.floatIn, { volume: 0.8 });
          playHaptic('lateHit');
          GameAudio.music.setState?.('muffled');
          break;
        }
        case EV_FLOAT_POP: {
          const p = pos(a, b);
          GameAudio.play(C.pop);
          playHaptic('tap');
          fx?.burst('bubbles', p.x, p.y, { count: 10 });
          GameAudio.music.setState?.('open');
          hooks.onFreeze(false);
          break;
        }
        case EV_FREEZE:
          GameAudio.duck(10, 200, 60000, 300);
          hooks.onFreeze(true);
          break;
        case EV_DOOM: {
          GameAudio.play(C.doom);
          clock.slowMo(0.4, 300, 120, true);
          if (!deps.calm) camera.punch(0.06);
          break;
        }
        case EV_GATE_NEAR:
          clock.slowMo(0.6, 520, 300, true);
          if (!deps.calm) camera.punch(0.08);
          hooks.onGateNear();
          break;
        case EV_WIPEOUT: {
          const p = pos(a, b);
          GameAudio.play(C.wipeout);
          GameAudio.play(C.nope, { volume: 0.6, delayMs: 120 });
          playHaptic('hurt', { priority: 4 });
          clock.hitStop(160, { holdSim: true, force: true });
          fx?.burst('bubbles', p.x, p.y, { count: 30 });
          fx?.flyUp('WIPEOUT!', deps.layout().w / 2, p.y - 100, { size: 'xl', color: '#ffffff', ms: 1100 });
          if (!deps.calm) camera.punch(0.12);
          hooks.onWipeout();
          break;
        }
        case EV_REVIVE: {
          const s = sharkPos();
          GameAudio.play(C.rescue);
          playHaptic('win', { priority: 4 });
          fx?.burst('bubbles', s.x, s.y, { count: 16 });
          fx?.flyUp('SECOND WIND!', s.x, s.y - 80, { size: 'lg', color: '#ffffff' });
          hooks.onRevive();
          break;
        }
        case EV_CLOCK_TICK:
          GameAudio.play(C.tick, { volume: 0.8 });
          playHaptic('tick');
          break;
        case EV_LINE_BOOST: {
          const L = deps.layout();
          GameAudio.play(C.lineBoost);
          playHaptic('tap');
          fx?.flyUp('LINE MOVED +1s', L.w / 2, L.skyH * 0.5 + 60, { size: 'md', color: '#ffffff' });
          break;
        }
        case EV_SPEED_BOOST:
        case EV_DRAFT: {
          const s = sharkPos();
          if (kind === EV_SPEED_BOOST || a === 1) fx?.burst('speedLines', s.x + 40, s.y, { count: 6 });
          break;
        }
        case EV_END:
          hooks.onEnd(a);
          break;
        default:
          break;
      }
    });
  };

  return { handle, cam };
}
