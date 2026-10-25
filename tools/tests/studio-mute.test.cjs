'use strict';
/**
 * Studio mute (src/dev/studioMute.ts): with EXPO_PUBLIC_STUDIO_MUTE=1 every expo-av Sound loads,
 * plays and replays muted, in any JS mode; without it nothing is patched (store and OTA bundles).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

function fakeExpoAv() {
  const calls = [];
  class Sound {
    async loadAsync(source, initialStatus = {}, downloadFirst = true) { calls.push(['load', initialStatus, downloadFirst]); }
    async setStatusAsync(status) { calls.push(['status', status]); }
    async replayAsync(status = {}) { calls.push(['replay', status]); }
    playAsync() { return this.setStatusAsync({ shouldPlay: true }); }
    setIsMutedAsync(isMuted) { return this.setStatusAsync({ isMuted }); }
  }
  return { calls, module: { Audio: { Sound } } };
}

test('studio mute forces isMuted on load, play, unmute and replay', async () => {
  const av = fakeExpoAv();
  const mod = loadTs('src/dev/studioMute.ts', { 'expo-av': av.module }, { process: { env: { EXPO_PUBLIC_STUDIO_MUTE: '1' } } });
  assert.equal(mod.STUDIO_MUTE, true);
  const sound = new av.module.Audio.Sound();
  await sound.loadAsync('music.mp3', { volume: 0.8, shouldPlay: true }, false);
  await sound.playAsync();
  await sound.setIsMutedAsync(false);
  await sound.replayAsync();
  assert.deepEqual(JSON.parse(JSON.stringify(av.calls)), [
    ['load', { volume: 0.8, shouldPlay: true, isMuted: true }, false],
    ['status', { shouldPlay: true, isMuted: true }],
    ['status', { isMuted: true }],
    ['replay', { isMuted: true }],
  ]);
});

test('without the flag nothing is patched', async () => {
  const av = fakeExpoAv();
  const mod = loadTs('src/dev/studioMute.ts', { 'expo-av': av.module }, { process: { env: {} } });
  assert.equal(mod.STUDIO_MUTE, false);
  const sound = new av.module.Audio.Sound();
  await sound.playAsync();
  await sound.setIsMutedAsync(false);
  assert.deepEqual(JSON.parse(JSON.stringify(av.calls)), [['status', { shouldPlay: true }], ['status', { isMuted: false }]]);
});
