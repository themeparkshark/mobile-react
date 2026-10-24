const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');

const RETIRED = 'https://assets.themeparkshark.com/mobile/production/assets/PuwNJoYcQVIbyy487jU41dMfHc5gHUBlXeVzZ93N.png';

// The 1.7.3 server splash still has a light-sword, a starred wizard hat, a
// castle and a ringed globe. It must never replace the bundled splash art, on
// any launch path: live theme, cached lastGood theme or the bundled fallback.
test('the retired server splash never replaces the bundled art', () => {
  const { themeSplashUri } = loadTs('src/utils/splashArt.ts');
  assert.equal(themeSplashUri(RETIRED), null);
  assert.equal(themeSplashUri(` ${RETIRED} `), null);
  assert.equal(themeSplashUri(RETIRED.replace('.png', '.webp')), null);
  assert.equal(themeSplashUri(null), null);
  assert.equal(themeSplashUri(undefined), null);
  assert.equal(themeSplashUri(''), null);
  assert.equal(themeSplashUri('http://example.com/a.png'), null, 'only https art');
  const fresh = 'https://assets.themeparkshark.com/mobile/production/assets/NewSplash123.png';
  assert.equal(themeSplashUri(fresh), fresh, 'a new server splash still works without an app update');
});

test('the bundled theme fallback names no server splash', () => {
  const theme = JSON.parse(read('src/api/defaults/theme.json'));
  assert.equal(theme.splash_screen_url, null);
});

test('the splash picks its art once and falls back to the bundled art', () => {
  const splash = read('src/screens/SplashScreen.tsx');
  assert.match(splash, /themeSplashUri\(theme\?\.splash_screen_url\)/);
  assert.match(splash, /useState\(\(\) => \{/, 'source is chosen once at mount, never swapped by a late theme');
  assert.match(splash, /onError=\{\(\) => setArtSource\(SPLASH_ART\)\}/);
  assert.doesNotMatch(splash, /\{ uri: theme\.splash_screen_url \}/, 'the raw theme URL is never used directly');
});

// Splash to Loading flashed dark navy for about 0.2 s while the loop video
// started. Loading and Login now draw the loop's first frame under the video.
test('Loading and Login open on the loop art, never a dark flash', () => {
  for (const file of ['src/screens/LoadingScreen.tsx', 'src/screens/Auth/LoginScreen.tsx']) {
    const src = read(file);
    assert.match(src, /images\/splash-loop-poster\.jpg/, file);
    assert.doesNotMatch(src, /#09268f/, `${file} has no dark navy base`);
    assert.ok(src.indexOf('source={SPLASH_POSTER}') < src.indexOf('<Video'), `${file} draws the poster under the video`);
  }
});

test('the splash decodes the Loading art ahead, under the launch art', () => {
  const splash = read('src/screens/SplashScreen.tsx');
  assert.match(splash, /NEXT_SCREEN_ART = \[\s*require\('..\/..\/assets\/images\/splash-loop-poster\.jpg'\),\s*require\('..\/..\/assets\/images\/screens\/login\/logo\.png'\),/);
  assert.ok(splash.indexOf('NEXT_SCREEN_ART.map') < splash.indexOf('source={LAUNCH_ART}'), 'hidden under the launch art');
});
