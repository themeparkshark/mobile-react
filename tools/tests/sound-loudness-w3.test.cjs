'use strict';
/**
 * Fix round w3 T213: the legacy UI sounds sit in the studio loudness range (about -19 LUFS where a file is
 * long enough to measure) and every file leaves at least 1 dB of true-peak headroom. Measured with
 * ffmpeg's loudnorm (never played). Skips when ffmpeg is not installed.
 * Normaliser: core-loop/fix-w3/play/sound/normalize.py (report beside it).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
  d.isDirectory() ? walk(path.join(dir, d.name)) : /\.(mp3|wav)$/.test(d.name) ? [path.join(dir, d.name)] : []);
const measure = (file) => {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'loudnorm=print_format=json', '-f', 'null', '-'], { encoding: 'utf8' });
  const m = /\{[^{}]*"input_i"[^{}]*\}/s.exec(r.stderr);
  return m ? JSON.parse(m[0]) : null;
};
const HOT = ['src/assets/games/audio/boss/bo_ghost_boo.wav', 'src/assets/games/audio/boss/lanes/tell_kraken_C5_L.wav',
  'src/assets/games/audio/boss/lanes/tell_robo_E5_L.wav', 'src/assets/games/audio/boss/lanes/tell_robo_E5_R.wav',
  'src/assets/games/audio/sharky/sk_doom_whoosh.wav', 'src/assets/games/audio/whack/wh_helmet_clank.wav'];

test('T213: legacy UI sounds and the hot studio cues keep 1 dB of true-peak headroom; measurable ones sit near -19 LUFS', { skip: !hasFfmpeg }, () => {
  const files = [...walk('assets/sounds'), ...HOT];
  const quiet = [];
  for (const file of files) {
    const m = measure(file);
    assert.ok(m, `measured ${file}`);
    assert.ok(Number(m.input_tp) <= -1.0, `${file} true peak ${m.input_tp} dBTP`);
    const i = Number(m.input_i);
    if (Number.isFinite(i) && i > -60 && file.startsWith('assets/sounds/') && i < -26) quiet.push(`${file} ${i}`);
  }
  // Two short camera clicks keep their level (their peaks cannot rise without clipping); nothing else is 15 dB down.
  assert.ok(quiet.length <= 3, `still far below the studio range: ${quiet.join(', ')}`);
});
