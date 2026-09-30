const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { loadTs, read, root } = require('./helpers/load-ts.cjs');
const { resolveApiUrl, CHANNEL_API_URLS } = loadTs('src/apiTarget.ts');
const gate = require(path.join(root, 'tools/check-api-target.cjs'));

const LOCAL = 'http://localhost:8010/api';
const TUNNEL = 'https://jackets-gap-families-country.trycloudflare.com/api';

test('store channels ignore a stray EXPO_PUBLIC_API_URL from an OTA publish machine', () => {
  for (const channel of ['production', 'testflight']) {
    assert.equal(resolveApiUrl({ isDev: false, channel, publicEnvUrl: LOCAL, bakedUrl: TUNNEL }), CHANNEL_API_URLS[channel]);
  }
});

test('development and channel-less local builds keep the Metro URL, then the baked URL', () => {
  assert.equal(resolveApiUrl({ isDev: true, channel: 'production', publicEnvUrl: LOCAL, bakedUrl: undefined }), LOCAL);
  assert.equal(resolveApiUrl({ isDev: false, channel: null, publicEnvUrl: undefined, bakedUrl: 'https://x.example.com/api' }), 'https://x.example.com/api');
  assert.equal(resolveApiUrl({ isDev: false, channel: 'development', publicEnvUrl: LOCAL, bakedUrl: undefined }), LOCAL);
});

test('channel URLs are store-safe and match the API_URL baked by the same eas.json profile', () => {
  const eas = JSON.parse(read('eas.json'));
  for (const [channel, url] of Object.entries(CHANNEL_API_URLS)) {
    assert.equal(gate.storeUrlProblem(url), null, channel);
    const profiles = Object.keys(eas.build).map(name => gate.resolveProfile(eas.build, name)).filter(p => p.channel === channel);
    assert.ok(profiles.length > 0, `no eas.json profile uses channel ${channel}`);
    for (const profile of profiles) assert.equal(profile.env.API_URL, url, channel);
  }
});

test('config.ts routes through the channel resolver', () => {
  const source = read('src/config.ts');
  assert.match(source, /resolveApiUrl\(/);
  assert.match(source, /Updates\.channel/);
});
