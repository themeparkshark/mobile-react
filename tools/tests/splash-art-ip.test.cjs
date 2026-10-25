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
  assert.match(splash, /useState<[^>]*> *\(\(\) => \{|useState\(\(\) => \{/, 'source is chosen once at mount, never swapped by a late theme');
  assert.match(splash, /onError=\{\(\) => setArtSource\(null\)\}/);
  assert.match(splash, /<SplashStill onReady=\{fadeIn\} \/>/, 'null draws the bundled still');
  assert.doesNotMatch(splash, /\{ uri: theme\.splash_screen_url \}/, 'the raw theme URL is never used directly');
});

// Splash to Loading flashed dark navy for about 0.2 s while the loop video
// started. Loading and Login now draw the loop's first frame under the video.
test('Loading and Login open on the loop art, never a dark flash', () => {
  for (const file of ['src/screens/LoadingScreen.tsx', 'src/screens/Auth/LoginScreen.tsx']) {
    const src = read(file);
    assert.match(src, /from '\.{1,2}\/(\.\.\/)?splashFrame'/, file);
    assert.doesNotMatch(src, /#09268f/, `${file} has no dark navy base`);
    assert.ok(src.indexOf('source={SPLASH_POSTER}') < src.indexOf('<Video'), `${file} draws the poster under the video`);
  }
});

test('Loading and Login fade in from the splash', () => {
  const root = read('src/Root.tsx');
  for (const name of ['Loading', 'Login']) {
    assert.match(root, new RegExp(`name="${name}"\\s*component=\\{${name}Screen\\}\\s*options=\\{\\{[^}]*animation: 'fade',\\s*animationDuration: 220,`), name);
  }
});

// Splash used to end on splash-art.jpg (different crop, title baked in at a
// different spot), so the 220 ms fade to Loading showed a doubled title for a
// frame or two. All three screens now draw one shared frame.
test('Splash ends on exactly the frame Loading and Login start on', () => {
  const frame = read('src/screens/splashFrame.tsx');
  assert.match(frame, /images\/splash-loop-poster\.jpg/);
  assert.match(frame, /screens\/login\/logo\.png/);
  for (const file of ['src/screens/LoadingScreen.tsx', 'src/screens/Auth/LoginScreen.tsx']) {
    const src = read(file);
    assert.match(src, /\.\.\.splashLogoFrame\(SCREEN_WIDTH, SCREEN_HEIGHT\)/, `${file} puts the title where Splash does`);
    assert.match(src, /source=\{SPLASH_LOGO\}/, file);
  }
  const fs = require('node:fs');
  const path = require('node:path');
  assert.ok(!fs.existsSync(path.join(__dirname, '../../assets/images/splash-art.jpg')), 'the old differently framed splash is gone');
});

test('the loop poster is sharp on the biggest phone', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const buf = fs.readFileSync(path.join(__dirname, '../../assets/images/splash-loop-poster.jpg'));
  // JPEG SOF0/SOF2 marker carries height then width.
  let i = 2; let w = 0;
  while (i < buf.length) {
    const m = buf[i + 1]; const len = buf.readUInt16BE(i + 2);
    if (m === 0xc0 || m === 0xc2) { w = buf.readUInt16BE(i + 7); break; }
    i += 2 + len;
  }
  assert.ok(w >= 1290, `poster width ${w}`);
  assert.ok(buf.length < 320 * 1024, `poster ${buf.length} bytes`);
});

test('Login keeps the title where the splash left it', () => {
  const src = read('src/screens/Auth/LoginScreen.tsx');
  assert.match(src, /const logoScale = useRef\(new Animated\.Value\(1\)\)\.current;/);
  assert.match(src, /const logoOpacity = useRef\(new Animated\.Value\(1\)\)\.current;/);
});
