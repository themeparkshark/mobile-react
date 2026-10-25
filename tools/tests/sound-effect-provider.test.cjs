const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function soundHarness(enabled = true, auth = null) {
  const sounds = [];
  const sfx = [];
  const cleanups = [];
  const warnings = [];
  const output = ts.transpileModule(
    fs.readFileSync(path.join(root, 'src/context/SoundEffectProvider.tsx'), 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        jsx: ts.JsxEmit.ReactJSX,
        target: ts.ScriptTarget.ES2020,
        esModuleInterop: true,
      },
    }
  ).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module,
    exports: module.exports,
    console: { warn: (...args) => warnings.push(args) },
    require(name) {
      if (name === 'react/jsx-runtime') return { jsx: (type, props) => ({ type, props }) };
      if (name === '../gamekit/audio/startGate') return { setAudioWanted() {} };
      if (name === 'react') return {
        createContext: () => ({ Provider: 'provider' }),
        useContext: () => auth ?? ({ isReady: true, player: { enabled_sound_effects: enabled } }),
        useEffect: effect => { const cleanup = effect(); if (cleanup) cleanups.push(cleanup); },
        useRef: value => ({ current: value }),
      };
      if (name === 'expo-av') return { Audio: { Sound: {
        async createAsync(source, options) {
          if (source === 'broken') throw new Error('decode failed');
          const sound = {
            source,
            options,
            unloaded: 0,
            played: 0,
            setOnPlaybackStatusUpdate(callback) { this.callback = callback; },
            async playAsync() { this.played++; },
            async unloadAsync() { this.unloaded++; },
          };
          sounds.push(sound);
          return { sound };
        },
      } } };
      if (name === './AuthProvider') return { AuthContext: {} };
      if (name === './sfxPolicy') return { ...require('./helpers/ts-module.cjs').loadTs('src/context/sfxPolicy.ts'), QUIET_CAPTURE: false };
      if (name === '../gamekit/SFX') return { SFX: { setEnabled(v) { sfx.push(['sfx', v]); }, setMusicEnabled(v) { sfx.push(['music', v]); }, holdUntilSettings() { sfx.push(['hold']); }, settingsKnown() { sfx.push(['known']); } } };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  const play = module.exports.SoundEffectProvider({ children: null }).props.value.playSound;
  return { play, sounds, warnings, sfx, unmount: () => cleanups.forEach(cleanup => cleanup()) };
}

test('rapid reward cues finish independently and release their audio resources', async () => {
  const harness = soundHarness();
  await harness.play('ride-coin');
  await harness.play('reward');
  assert.deepEqual(harness.sounds.map(sound => sound.played), [1, 1]);
  assert.deepEqual(harness.sounds.map(sound => sound.unloaded), [0, 0]);

  harness.sounds[0].callback({ isLoaded: true, didJustFinish: true });
  assert.deepEqual(harness.sounds.map(sound => sound.unloaded), [1, 0]);
  harness.sounds[1].callback({ isLoaded: true, didJustFinish: true });
  assert.deepEqual(harness.sounds.map(sound => sound.unloaded), [1, 1]);
});

test('sound setting, overlap limit, and unmount bound playback', async () => {
  const muted = soundHarness(false);
  await muted.play('ride-coin');
  assert.equal(muted.sounds.length, 0);

  const harness = soundHarness();
  for (let i = 0; i < 5; i++) await harness.play(`cue-${i}`);
  assert.deepEqual(harness.sounds.map(sound => sound.unloaded), [1, 0, 0, 0, 0]);
  harness.unmount();
  assert.deepEqual(harness.sounds.map(sound => sound.unloaded), [1, 1, 1, 1, 1]);
  await harness.play('late-cue');
  assert.equal(harness.sounds.at(-1).unloaded, 1);
});

test('a bad audio asset does not break later rewards', async () => {
  const harness = soundHarness();
  await harness.play('broken');
  await harness.play('reward');
  assert.equal(harness.warnings.length, 1);
  assert.equal(harness.sounds[0].played, 1);
});

test('landing cue keeps its mix while using the shared sound setting', async () => {
  const harness = soundHarness();
  await harness.play('coin-landing', { volume: 0.6, rate: 1.1 });
  assert.equal(harness.sounds[0].options.volume, 0.6);
  assert.equal(harness.sounds[0].options.rate, 1.1);
  const muted = soundHarness(false);
  await muted.play('coin-landing', { volume: 0.6, rate: 1.1 });
  assert.equal(muted.sounds.length, 0);
});

test('the audio engine is released whenever sign-in ends, even signed out or after an auth error, so a failed load never mutes the app', () => {
  // Still loading: held, nothing known yet.
  const loading = soundHarness(true, { isReady: false, player: null });
  assert.deepEqual(loading.sfx.filter(([k]) => k === 'known'), []);
  assert.ok(loading.sfx.some(([k]) => k === 'hold'), 'held from module load');
  // Signed out, a keychain error, a 401 or an outage with no saved profile all end with isReady and no player.
  const signedOut = soundHarness(true, { isReady: true, player: null });
  assert.ok(signedOut.sfx.some(([k]) => k === 'known'), 'released: the hold never outlives sign-in');
  // An outage that kept the saved profile, with sound on: game sound plays.
  const cached = soundHarness(true, { isReady: true, player: { enabled_sound_effects: true, enabled_music: true } });
  assert.ok(cached.sfx.some(([k]) => k === 'known'));
  assert.deepEqual(cached.sfx.filter(([k]) => k === 'sfx' || k === 'music'), [['sfx', true], ['music', true]]);
  // A signed-in muted player: released, with both off (so the engine still never starts).
  const muted = soundHarness(true, { isReady: true, player: { enabled_sound_effects: false, enabled_music: false } });
  assert.ok(muted.sfx.some(([k]) => k === 'known'));
  assert.deepEqual(muted.sfx.filter(([k]) => k === 'sfx' || k === 'music'), [['sfx', false], ['music', false]]);
});

test('every way the saved-session load can end sets isReady (none can hold the audio engine forever)', () => {
  const auth = fs.readFileSync(path.join(root, 'src/context/AuthProvider.tsx'), 'utf8');
  // No saved token, and a keychain read that fails.
  assert.match(auth, /if \(_token\) \{\s*setToken\(_token\);\s*\} else \{[\s\S]{0,120}?setIsReady\(true\);/);
  assert.match(auth, /\}\)\.catch\(\(\) => \{[\s\S]{0,120}?setIsReady\(true\);/);
  // The profile load: success, a slow network on the saved profile, 401 (signed out), a cached
  // profile after an error, and any other error. loadLaunchProfile never rejects (launch-profile.test.cjs),
  // so every outcome reaches one of these.
  const load = auth.slice(auth.indexOf('const launch = await loadLaunchProfile(refreshPlayer, readCachedPlayer);'), auth.indexOf('}, [token]);'));
  assert.ok(load.length > 0);
  assert.equal((load.match(/setIsReady\(true\)/g) || []).length, 5, 'fresh, slow saved profile, 401, cached profile, and every other error');
  const launchProfile = fs.readFileSync(path.join(root, 'src/context/launchProfile.ts'), 'utf8');
  assert.match(launchProfile, /readCached\(\)\.catch\(\(\) => null\)/, 'a broken saved profile read never rejects');
  assert.match(launchProfile, /fresh\.then\(\s*\(player\)[\s\S]*?\(error\)/, 'a failed /me is an outcome, never a rejection');
  // The profile request cannot hang forever: the API client times out.
  assert.match(fs.readFileSync(path.join(root, 'src/api/client.ts'), 'utf8'), /timeout: 12000,/);
});
