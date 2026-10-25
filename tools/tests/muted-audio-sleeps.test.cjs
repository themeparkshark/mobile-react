// A player with sound effects off never wakes the audio hardware: no engine start for preloads
// or one-shots (battery, and a stuck audio device can never stall or crash a muted player).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = (p) => fs.readFileSync(path.join(__dirname, '..', '..', p), 'utf8');

test('GameAudio.preload loads nothing without an engine (sound off)', () => {
  const src = read('src/gamekit/audio/GameAudio.ts');
  const body = src.slice(src.indexOf('async preload(names?: string[])'));
  const init = body.indexOf('await this.init();');
  const guard = body.indexOf('if (!this.backend) return false;');
  assert.ok(init > 0 && guard > init && guard < body.indexOf('const list'), 'preload stops when init left the engine off');
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

test('GameAudio.init leaves the hardware asleep while sound is off or settings are unknown (not cached)', () => {
  const src = read('src/gamekit/audio/GameAudio.ts');
  const body = src.slice(src.indexOf("init(choice: BackendChoice = 'auto')"));
  const cached = body.indexOf('if (this.initPromise) return this.initPromise;');
  const guard = body.indexOf('if (!this.wantsAudio()) return Promise.resolve();');
  const assign = body.indexOf('this.initPromise = (async');
  assert.ok(cached >= 0 && guard > cached && assign > guard, 'guard sits after the cache check and before the init promise is stored');
  assert.match(src, /return !this\.settingsPending && \(this\.sfxEnabled \|\| this\.musicEnabled\);/);
});

test('loadKey never dereferences a missing backend', () => {
  const src = read('src/gamekit/audio/GameAudio.ts');
  assert.doesNotMatch(src, /this\.backend!\.load/);
  assert.match(src, /if \(!this\.backend\) \{ this\.loading\.delete\(key\); return false; \}/);
});

test('the app music and sound settings reach the studio engine', () => {
  const src = read('src/context/SoundEffectProvider.tsx');
  assert.match(src, /SFX\.setMusicEnabled\(musicAllowed\)/);
  assert.match(src, /SFX\.setEnabled\(allowed\)/);
});
