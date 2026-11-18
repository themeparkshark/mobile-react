'use strict';
/**
 * Fix round w3 T188: Parade Beat's song stages, Community Center and Gym Battle obey the Music and
 * Sound Effects settings (they used to play straight through expo-av).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const read = (p) => fs.readFileSync(p, 'utf8');

test('T188: every song volume passes the Music gate; muted songs keep running as the beat clock', () => {
  const song = read('src/games/rhythm/audio/SongPlayer.ts');
  assert.match(song, /function musicGate\(\): number \{\n\s+return GameAudio\.isMusicEnabled\(\) \? 1 : 0;/);
  assert.doesNotMatch(song, /volume: this\.gain(?! \* musicGate\(\))/);
  assert.doesNotMatch(song, /setVolumeAsync\(this\.gain \* (?!musicGate)/);
  const audio = read('src/gamekit/audio/GameAudio.ts');
  assert.match(audio, /b\.musicStart\(d\.deck, d\.key, \{ gain: d\.gain \* this\.stemGate\(\)/);
  assert.match(audio, /this\.backend\?\.musicGain\(deck, Math\.max\(0, gain\) \* this\.stemGate\(\), Math\.max\(0, rampMs\)\);/);
  assert.match(audio, /this\.stemGains\.forEach\(\(gain, deck\) => this\.backend\?\.musicGain\(deck, gain \* this\.stemGate\(\), 150\)\);/);
});

test('T188: Community Center and Gym Battle play through the settings-aware sound effects player', () => {
  for (const file of ['src/screens/CommunityCenterScreen.tsx', 'src/screens/GymBattle/GymBattleScreen.tsx']) {
    const src = read(file);
    assert.doesNotMatch(src, /Audio\.Sound\.createAsync/, file);
    assert.match(src, /const \{ playSound: playSfx \} = useContext\(SoundEffectContext\);/, file);
  }
});
