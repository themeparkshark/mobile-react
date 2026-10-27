const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');

const LAUNCH_ART_SHA1 = 'f7014e4ca39cb1abf962aee4506d0dd8239c1f56';
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
  // visual-defects dropped the dead field entirely (the bundled splash is permanent): absent counts as none.
  assert.ok(theme.splash_screen_url == null);
});

// Wave 5 merge: the Splash route and Loading are the visual-defects launch scene. It draws only the
// bundled launch-art.jpg (the art lane's foam-finger frame with the title on the native title spot),
// so no server theme splash, retired or not, ever reaches the launch.
test('the launch scene draws only the bundled foam-finger art, never a server splash', () => {
  for (const file of ['src/screens/SplashScreen.tsx', 'src/screens/LoadingScreen.tsx', 'src/components/launch/LaunchScene.tsx']) {
    assert.doesNotMatch(read(file), /splash_screen_url/, file);
  }
  assert.match(read('src/screens/SplashScreen.tsx'), /return <LaunchScene active=\{focused\} \/>;/);
  assert.match(read('src/components/launch/LaunchScene.tsx'), /assets\/images\/launch-art\.jpg/);
  const crypto = require('node:crypto');
  const fs = require('node:fs');
  const path = require('node:path');
  // launch-art.jpg: splash-loop-poster.jpg (foam finger, Dustin's PICK) cover-fit to the native art's
  // 1080x2500 frame, logo.png in the native title box (14, 380, 1052 x 264), saved at 750 x 1736.
  const sha1 = crypto.createHash('sha1').update(fs.readFileSync(path.join(__dirname, '../../assets/images/launch-art.jpg'))).digest('hex');
  assert.equal(sha1, LAUNCH_ART_SHA1, 'launch-art.jpg is the approved foam-finger frame');
});

// Splash to Login flashed dark navy for about 0.2 s while the loop video
// started. Login draws the loop's first frame under the video.
test('Login opens on the loop art, never a dark flash', () => {
  const src = read('src/screens/Auth/LoginScreen.tsx');
  assert.match(src, /from '\.{1,2}\/(\.\.\/)?splashFrame'/);
  assert.doesNotMatch(src, /#09268f/);
  assert.ok(src.indexOf('source={SPLASH_POSTER}') < src.indexOf('<Video'), 'draws the poster under the video');
});

test('Login fades in from the splash; Loading is the same launch scene with no transition', () => {
  const root = read('src/Root.tsx');
  assert.match(root, /name="Login"\s*component=\{LoginScreen\}\s*options=\{\{[^}]*animation: 'fade',\s*animationDuration: 220,/);
  assert.match(root, /name="Loading"\s*component=\{LoadingScreen\}\s*options=\{\{[^}]*animation: 'none',/);
});

test('Login keeps the title on the launch art title spot', () => {
  const frame = read('src/screens/splashFrame.tsx');
  assert.match(frame, /images\/splash-loop-poster\.jpg/);
  assert.match(frame, /screens\/login\/logo\.png/);
  const src = read('src/screens/Auth/LoginScreen.tsx');
  assert.match(src, /\.\.\.splashLogoFrame\(SCREEN_WIDTH, SCREEN_HEIGHT\)/);
  assert.match(src, /source=\{SPLASH_LOGO\}/);
  const fs = require('node:fs');
  const path = require('node:path');
  assert.ok(!fs.existsSync(path.join(__dirname, '../../assets/images/splash-art.jpg')), 'the old differently framed splash is gone');
  assert.ok(!fs.existsSync(path.join(__dirname, '../../assets/images/screens/login/splash-loop-poster.jpg')), 'the old light-sword poster is gone');
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

// The title sits where the native launch art draws it (cover fit), so it holds
// still from the first native frame through Splash, Loading and Login.
test('the shared title frame matches the launch art title on every phone size', () => {
  const ts = require('typescript');
  const src = read('src/screens/splashFrame.tsx');
  const start = src.indexOf('const LAUNCH_ART_SIZE');
  const end = src.indexOf('/**', start);
  const js = ts.transpileModule(src.slice(start, end) + '\nmodule.exports = { splashLogoFrame };', { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const m = { exports: {} };
  new Function('module', 'exports', js)(m, m.exports);
  const { splashLogoFrame } = m.exports;
  for (const [w, h] of [[375, 667], [402, 874], [440, 956]]) {
    const f = splashLogoFrame(w, h);
    const k = Math.max(w / 1080, h / 2500);
    assert.ok(Math.abs(f.width - 1052 * k) < 0.01, `${w}x${h} width`);
    assert.ok(Math.abs(f.top - ((h - 2500 * k) / 2 + 380 * k)) < 0.01, `${w}x${h} top`);
    assert.ok(Math.abs(f.width / f.height - 1284 / 322) < 0.02, 'logo aspect kept');
    assert.ok(f.top > 20 && f.left >= 0 && f.left + f.width <= w, `${w}x${h} title on screen`);
  }
  assert.match(src, /onDisplay=\{done\}/, 'fades only once both images are on screen');
});
