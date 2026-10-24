// A player with sound effects off never wakes the audio hardware: no engine start for preloads
// or one-shots (battery, and a stuck audio device can never stall or crash a muted player).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('GameAudio.preload returns before init when sound effects are off', () => {
  const src = read('src/gamekit/audio/GameAudio.ts');
  const body = src.slice(src.indexOf('async preload(names?: string[])'));
  const guard = body.indexOf('if (!this.sfxEnabled) return;');
  const init = body.indexOf('await this.init();');
  assert.ok(guard > 0 && init > 0 && guard < init, 'the sfx guard comes before init in preload');
});

test('SFX.play returns before init when sound effects are off', () => {
  const src = read('src/gamekit/SFX.ts');
  const body = src.slice(src.indexOf('async play('));
  const guard = body.indexOf('if (!GameAudio.isSfxEnabled()) return;');
  const init = body.indexOf('GameAudio.init()');
  assert.ok(guard > 0 && init > 0 && guard < init, 'the sfx guard comes before init in play');
});

test('play() still loads lazily, so turning sound back on works without a preload', () => {
  const src = read('src/gamekit/audio/GameAudio.ts');
  assert.match(src, /Lazy: load now, play when ready/);
});

test('GameAudio.init leaves the hardware asleep with sound effects and music both off (not cached)', () => {
  const src = read('src/gamekit/audio/GameAudio.ts');
  const body = src.slice(src.indexOf("init(choice: BackendChoice = 'auto')"));
  const cached = body.indexOf('if (this.initPromise) return this.initPromise;');
  const guard = body.indexOf('if (!this.sfxEnabled && !this.musicEnabled) return Promise.resolve();');
  const assign = body.indexOf('this.initPromise = (async');
  assert.ok(cached >= 0 && guard > cached && assign > guard, 'guard sits after the cache check and before the init promise is stored');
});

test('loadKey never dereferences a missing backend', () => {
  const src = read('src/gamekit/audio/GameAudio.ts');
  assert.doesNotMatch(src, /this\.backend!\.load/);
  assert.match(src, /if \(!backend\) \{ this\.loading\.delete\(key\); return false; \}/);
});

test('the app music setting reaches the studio engine', () => {
  const src = read('src/context/SoundEffectProvider.tsx');
  assert.match(src, /GameAudio\.setMusicEnabled\(!\(isReady && !player\?\.enabled_music\)\)/);
});
