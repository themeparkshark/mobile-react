// Ride Photo difficulty proof (R7): a bot with +-150 ms of timing jitter takes the first shot of many seeded
// passes per tier, and the grade spread is reported. Two bots: "eyes on the car" aims at the moment the car
// meets the locked frame (the camera does not fool it), and "camera-naive" aims at the car's nominal arrival
// (the sway and the Legendary bump push its shot early or late). Gull passes cap a shot in the gull's
// window at Good; the "dodger" variant holds its shot on a gull pass (a free dodge) and is counted apart.
// Usage: node tools/ride-photo-difficulty.cjs [passes]   (also used by tools/tests/ride-photo-difficulty.test.cjs)
const { loadTs } = require('./tests/helpers/ts-module.cjs');
const ride = loadTs('src/screens/ExploreScreen/ridePhoto.ts');

function rng(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s ^ (s >>> 15), 0x2c1b3c6d) + 0x6d2b79f5) >>> 0; return s / 4294967296; }; }

function simulate(passes = 2000, opts = {}) {
  const out = {};
  for (const tier of [2, 3, 4, 5]) {
    const r = rng(1000 + tier);
    const counts = { frame_it: 0, great: 0, good: 0, blurry: 0, photobombed: 0, gullPasses: 0, dodged: 0, camMsAbs: 0 };
    const sway = ride.swayFor(tier);
    for (let i = 0; i < passes; i++) {
      const seed = 5000 + i * 13, pass = i % 3;
      const jitter = (r() * 2 - 1) * 150;
      // The camera at a random moment of its slow pan, plus the Legendary bump 700 to 900 ms before arrival.
      const sec = r() * 30;
      let camX = ride.swayAt(sway, sec, 1).x;
      const bump = ride.bumpFor(tier, seed, pass);
      if (bump) camX += ride.bumpAt(ride.bumpCurve(bump.leadMs), bump.dir).x;
      const vx = 0.15 + r() * 0.2; // pt per ms at the frame (the rides' range)
      const camMs = ride.swayShiftMs(camX, vx, 1);
      counts.camMsAbs += Math.abs(camMs);
      const offset = opts.naive ? jitter + camMs : jitter;
      let grade = ride.gradeOffset(offset, 0, tier).grade;
      const gull = ride.gullFor(tier, seed, pass);
      if (gull) {
        counts.gullPasses++;
        const inFrame = ride.gullInFrame(offset - gull.centerMs);
        if (inFrame && opts.dodge) { counts.dodged++; continue; }
        if (inFrame && grade !== 'blurry') { counts.photobombed++; grade = ride.photobombCap(grade); }
      }
      counts[grade]++;
    }
    const shots = passes - counts.dodged;
    const pct = k => Math.round((1000 * counts[k]) / shots) / 10;
    out[tier] = { shots, frame_it: pct('frame_it'), great: pct('great'), good: pct('good'), blurry: pct('blurry'),
      photobombed: pct('photobombed'), gullPasses: counts.gullPasses, dodged: counts.dodged, meanCamMs: Math.round(counts.camMsAbs / passes) };
  }
  return out;
}

module.exports = { simulate };

if (require.main === module) {
  const n = Number(process.argv[2]) || 2000;
  const names = { 2: 'Uncommon', 3: 'Rare', 4: 'Epic', 5: 'Legendary' };
  for (const [label, opts] of [['eyes on the car', {}], ['camera-naive', { naive: true }], ['eyes on the car, dodges gulls', { dodge: true }]]) {
    const res = simulate(n, opts);
    console.log(`\n${label} (${n} first shots per tier, +-150 ms uniform jitter)`);
    console.log('| Tier | Frame It! | Great | Good | Blurry | Photobombed | Gull passes | Dodged | Mean camera shift |');
    console.log('|---|---|---|---|---|---|---|---|---|');
    for (const t of [2, 3, 4, 5]) {
      const x = res[t];
      console.log(`| ${names[t]} | ${x.frame_it}% | ${x.great}% | ${x.good}% | ${x.blurry}% | ${x.photobombed}% | ${x.gullPasses} | ${x.dodged} | ${x.meanCamMs} ms |`);
    }
  }
}
