const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { read, root } = require('./helpers/load-ts.cjs');

const size = file => fs.statSync(path.join(root, file)).size;
const probe = file => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path.join(root, file)], { encoding: 'utf8' }));
const hasFfprobe = (() => { try { execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();

test('login and loading loops are small HEVC files iOS can hardware decode', { skip: !hasFfprobe && 'ffprobe not installed' }, () => {
  for (const [file, maxBytes] of [['assets/videos/splash-loop.mp4', 6_000_000], ['assets/videos/community-center-bg.mp4', 2_500_000]]) {
    assert.ok(size(file) <= maxBytes, `${file} is ${size(file)} bytes`);
    const streams = probe(file).streams;
    const video = streams.find(s => s.codec_type === 'video');
    assert.equal(video.codec_name, 'hevc', file);
    assert.equal(video.codec_tag_string, 'hvc1', `${file} needs the hvc1 tag for AVPlayer`);
    assert.equal(streams.some(s => s.codec_type === 'audio'), false, `${file} plays muted, so it carries no audio track`);
  }
});

// Stamp art is Dustin's hand-illustrated art: it may be downscaled (the
// largest on-screen use is 180pt, 540px at 3x) but never palette-quantized or
// re-styled. Quantizing added visible dither noise to the cel shading.
test('stamp art is capped at 600px and stays full-colour RGBA', () => {
  const dir = path.join(root, 'assets/images/stamps');
  let total = 0;
  for (const name of fs.readdirSync(dir).filter(f => f.endsWith('.png'))) {
    const bytes = size(`assets/images/stamps/${name}`);
    total += bytes;
    const header = fs.readFileSync(path.join(dir, name)).subarray(16, 26);
    const width = header.readUInt32BE(0);
    const height = header.readUInt32BE(4);
    const bitDepth = header[8];
    const colorType = header[9];
    assert.equal(colorType, 6, `${name} must stay truecolour RGBA (PNG colour type 6), got ${colorType}`);
    assert.equal(bitDepth, 8, `${name} bit depth`);
    if (name !== 'stamp-logo.png') assert.ok(Math.max(width, height) <= 600, `${name} is ${width}x${height}`);
  }
  assert.ok(total < 9_000_000, `stamps total ${total} bytes`);
});

test('the unused 3D avatar, its model and its GL stack are gone from the binary', () => {
  assert.ok(!fs.existsSync(path.join(root, 'assets/models/shark-avatar.glb')));
  assert.ok(!fs.existsSync(path.join(root, 'src/components/SharkAvatar3D.tsx')));
  const pkg = JSON.parse(read('package.json'));
  assert.ok(pkg.expo.autolinking.exclude.includes('expo-gl'));
  let hits = '';
  try {
    hits = execFileSync('git', ['grep', '-l', '-E', "from 'expo-gl'|from 'expo-three'|three-stdlib", '--', 'src'], { cwd: root, encoding: 'utf8' }).trim();
  } catch (error) {
    if (error.status !== 1) throw error;
  }
  assert.equal(hits, '');
});

test('the JS splash and the native launch screen use the same art', () => {
  assert.match(read('src/screens/SplashScreen.tsx'), /assets\/images\/splash-bg\.png/);
  assert.ok(!fs.existsSync(path.join(root, 'assets/splash.png')), 'the old black 1-bit splash.png is gone');
});
