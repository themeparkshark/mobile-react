const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// Sharky is a web page in a WebView that makes its own beeps with WebAudio. Until Nov 18 2026 it
// ignored the Sound Effects switch in Settings (and the studio mute on test simulators).
test('Sharky is silent when Sound Effects is off or the studio mute is on', () => {
  const source = read('src/components/SharkMiniGame.tsx');
  assert.match(source, /const silent = STUDIO_MUTE \|\| player\?\.enabled_sound_effects === false;/);
  assert.match(source, /injectedJavaScriptBeforeContentLoaded=\{silent \? SILENCE_WEB_AUDIO : undefined\}/);
  assert.match(source, /SILENCE_WEB_AUDIO = 'window\.AudioContext = void 0; window\.webkitAudioContext = void 0; true;'/);
});

test('the Sharky page only reaches audio through window.AudioContext inside a try/catch', () => {
  const html = read('src/assets/minigames/sharky/sharky.html');
  // One lookup, one constructor call, and that call sits inside the beep helper's try block.
  assert.equal((html.match(/window\.AudioContext\|\|window\.webkitAudioContext/g) || []).length, 1);
  const ctor = html.match(/var (\w+)=window\.AudioContext\|\|window\.webkitAudioContext,(\w+)=null;function (\w+)\(\)\{return \2\|\|\(\2=new \1\),\2\}/);
  assert.ok(ctor, 'the audio context is built lazily by one helper');
  const helper = ctor[3];
  const calls = html.split(`${helper}()`).length - 1;
  assert.equal(calls, 2, 'the helper is defined once and called once');
  assert.match(html, new RegExp(`try\\{let \\w+=${helper}\\(\\)`), 'the only call is the first statement of a try block');
  for (const other of ['new Audio(', '<audio', 'Howl']) assert.equal(html.includes(other), false, `no other audio path: ${other}`);
});

test('Banana Basket has no sound of its own', () => {
  const html = read('src/assets/minigames/banana-basket/banana-basket.html');
  assert.doesNotMatch(html, /AudioContext|new Audio\(|<audio|Howl/);
});
