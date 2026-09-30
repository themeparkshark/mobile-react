/**
 * Boss Brawl audio: the audio lead's studio cues (ElevenLabs one-shots, Chris
 * loop edits) with Chris fallbacks, round-robin pools with +-3% rate and
 * +-1.5 dB gain, the per-opening hit ladder and eyes-free lane tells
 * (lane pitch C5 / E5 / G5, hard-panned L / C / R files).
 */
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { registerStudioAudio } from '../../gamekit/audio/studioLibrary';
import type { BossId } from './sim/constants';

export const BOSS_KEY: Record<BossId, 'kraken' | 'robo' | 'ghost'> = { kraken: 'kraken', robo_shark: 'robo', ghost_squid: 'ghost' };
const NOTES = ['C5', 'E5', 'G5'] as const;
const SIDES = ['L', 'C', 'R'] as const;

export function bossBeds(boss: BossId): { main: string; fury: string; rest: string } {
  const k = BOSS_KEY[boss];
  const pick = (id: string, fb: string) => (GameAudio.bed(id) ? id : fb);
  return {
    main: pick(`boss_${k}_loop`, 'chris.track1'),
    fury: pick(`boss_${k}_fury_loop`, pick(`boss_${k}_loop`, 'chris.track1')),
    rest: pick('boss_intermission_loop', 'chris.track1'),
  };
}

function has(id: string): boolean {
  return GameAudio.hasCue(id);
}

function first(...ids: string[]): string {
  for (const id of ids) if (has(id)) return id;
  return ids[ids.length - 1];
}

const lastVariant: Record<string, number> = {};

/** Round-robin between the two generated variants, with rate and gain jitter. */
function rr(base: string, opts: { pitch?: number; volume?: number; pan?: number } = {}): void {
  const alt = `${base}_b`;
  const pool = has(alt) ? [base, alt] : [base];
  const k = ((lastVariant[base] ?? -1) + 1) % pool.length;
  lastVariant[base] = k;
  const jitter = (Math.random() * 2 - 1) * 0.5; // +-3% rate is about +-0.5 semitone
  const gain = Math.pow(10, ((Math.random() * 2 - 1) * 1.5) / 20);
  GameAudio.play(pool[k], { ...opts, pitch: (opts.pitch ?? 0) + jitter, volume: Math.min(1, (opts.volume ?? 1) * gain) });
}

export const bossSfx = {
  init(): void {
    registerStudioAudio('boss');
  },
  preload(boss: BossId): void {
    const k = BOSS_KEY[boss];
    const ids = [
      `bo_enter_${k}`, 'bo_hit', 'bo_hit_b', 'bo_crit', 'bo_crit_b', 'bo_clank', 'bo_clank_b', 'bo_perfect', 'bo_buoy_snag',
      'bo_kraken_slam', 'bo_opening_close', 'bo_break', 'bo_heavy_release', 'bo_feint_trill', 'bo_phase_up', 'bo_gauge',
      'sh_go_horn', ...NOTES.flatMap((n) => SIDES.map((s) => `tell_${k}_${n}_${s}`)),
    ].filter(has);
    void GameAudio.preload(ids).catch(() => undefined);
  },
  /** Lane tell: lane pitch + hard pan, 3 dB above other SFX on the frame. */
  tell(boss: BossId, lane: number): void {
    const k = BOSS_KEY[boss];
    const id = `tell_${k}_${NOTES[lane]}_${SIDES[lane]}`;
    GameAudio.play(first(id, `bo_tell_${k}`, 'ui.select'), { volume: 1 });
  },
  /** Robo show: each icon has its own pitch, panned to its socket. */
  icon(boss: BossId, icon: number, lane: number): void {
    const k = BOSS_KEY[boss];
    GameAudio.play(first(`tell_${k}_${NOTES[icon]}_${SIDES[lane]}`, `bo_tell_${k}`, 'ui.select'));
  },
  feint(): void { GameAudio.play(first('bo_feint_trill', 'ui.tap'), { volume: 0.9 }); },
  slam(boss: BossId): void {
    if (boss === 'kraken') GameAudio.play(first('bo_kraken_slam', 'sh_splash_l', 'fx.whoosh'));
    else if (boss === 'robo_shark') GameAudio.play(first('bo_short', 'fx.nopeShort'));
    else GameAudio.play(first('bo_ghost_boo', 'fx.whoosh'));
  },
  snag(boss: BossId): void {
    if (boss === 'kraken') rr(first('bo_buoy_snag', 'fx.hit'));
    else if (boss === 'robo_shark') GameAudio.play(first('ui.confirm', 'ui.confirm'), { pitch: 7 });
    else GameAudio.play(first('bo_lantern', 'fx.reveal'));
  },
  lock(step: number): void { GameAudio.play(first('ui.confirm', 'ui.confirm'), { pitch: [0, 4, 7, 12][step] ?? 0 }); },
  perfect(): void {
    GameAudio.play(first('bo_perfect', 'fx.reveal'));
    GameAudio.play('fx.reveal', { volume: 0.5 });
    GameAudio.duck(3, 30, 120, 150);
  },
  punish(boss: BossId): void {
    if (boss === 'kraken') GameAudio.play(first('sh_splash_l', 'fx.whoosh'), { volume: 0.8 });
    else if (boss === 'ghost_squid') GameAudio.play(first('bo_ghost_spooked', 'fx.nopeShort'));
    else GameAudio.play(first('bo_short', 'fx.nopeShort'));
    GameAudio.play('fx.nopeShort', { volume: 0.6 });
  },
  early(): void { GameAudio.play(first('ui_tick', 'ui.tap'), { volume: 0.4 }); },
  clank(): void { rr(first('bo_clank', 'ui.confirm'), { volume: 0.8 }); },
  guardCounter(): void { GameAudio.play(first('sh_dizzy', 'fx.nopeShort')); },
  /** Opening hit ladder: +1 semitone per hit, cap +7, resets when the opening closes. */
  hit(n: number): void { rr(first('bo_hit', 'fx.hit'), { pitch: Math.min(7, n) }); },
  crit(n: number): void { rr(first('bo_crit', 'fx.hit'), { pitch: Math.min(7, n) * 0.5 }); },
  heavy(): void { GameAudio.play(first('bo_heavy_release', 'fx.hit')); },
  close(): void { rr(first('bo_opening_close', 'fx.hit'), { volume: 0.85 }); },
  pop(): void { rr(first('sh_bubble_pop', 'fx.hit')); },
  grey(): void { GameAudio.play(first('ui_tick', 'ui.tap'), { volume: 0.5 }); },
  gaugeHot(): void { GameAudio.play(first('bo_gauge', 'fx.reveal'), { volume: 0.7 }); },
  brk(boss: BossId): void {
    GameAudio.play(first('bo_break', 'fx.hit'));
    GameAudio.play(first('fx.redeemOpen', 'fx.reveal'), { volume: 0.6 });
    if (boss === 'kraken') GameAudio.play(first('bo_seagulls', 'sh_seagull', 'fx.whoosh'), { volume: 0.7, delayMs: 120 });
    GameAudio.duck(5, 40, 250, 300);
  },
  finisherReady(): void { GameAudio.play(first('bo_finisher_ready', 'fx.reveal')); },
  finisherImpact(boss: BossId): void {
    GameAudio.play(first('bo_finisher_impact', 'fx.hit'));
    GameAudio.play(first(boss === 'kraken' ? 'bo_anchor' : boss === 'robo_shark' ? 'bo_plug_yank' : 'sh_camera', 'fx.hit'), { volume: 0.9 });
    GameAudio.duck(5, 40, 250, 300);
  },
  ko(boss: BossId): void {
    GameAudio.play(first(`bo_ko_${BOSS_KEY[boss]}`, 'fx.reward'));
    GameAudio.play(first('sting_ko', 'fx.reward'), { delayMs: 350 });
    GameAudio.play('fx.reward', { volume: 0.6, delayMs: 700 });
  },
  retreat(): void { GameAudio.play(first('sting_retreat', 'fx.whoosh')); },
  zero(): void { GameAudio.play(first('sting_zero', 'fx.nopeShort')); },
  entrance(boss: BossId): void { GameAudio.play(first(`bo_enter_${BOSS_KEY[boss]}`, 'fx.whoosh')); },
  phaseUp(): void {
    GameAudio.play(first('bo_phase_up', 'fx.reveal'));
    GameAudio.play('fx.whoosh', { volume: 0.7 });
    GameAudio.duck(5, 40, 250, 300);
  },
  go(): void { GameAudio.play(first('sh_go_horn', 'fx.whoosh')); },
  ready(): void { GameAudio.play(first('ui.select', 'ui.select'), { pitch: 4 }); },
  tideTick(n: number): void { GameAudio.play(first('ui.select', 'ui.select'), { pitch: Math.min(12, n) * 0.6, volume: 0.5 }); },
  surge(): void { GameAudio.play(first('bo_team_surge', 'fx.reveal')); },
  sync(): void { GameAudio.play(first('bo_sync_strike', 'fx.reveal')); },
  ally(): void { GameAudio.play(first('sh_join', 'fx.whoosh'), { volume: 0.8 }); },
  tier(): void { GameAudio.play(first('sh_tier_up', 'fx.reveal'), { volume: 0.8 }); },
  star(n: number): void { GameAudio.play('fx.reveal', { delayMs: n * 220 }); },
};
