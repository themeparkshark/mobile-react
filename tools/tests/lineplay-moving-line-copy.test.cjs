// The line is always moving (Dustin, 2026-09-30). Queue copy must never ask a
// guest to wait for the line to stop, and a Memory round (one player at a
// time, no real turns) must never promise turn-taking.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel, out);
    else if (/\.tsx?$/.test(entry.name) && !/devTour\.ts$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const STOPPED_LINE = [
  /line is (safely )?stopped/i,
  /while (safely )?stopped/i,
  /when the line stops/i,
  /only when it is safe/i,
  /after the line moves/i,
  /pause(d)? (when|while) the line moves/i,
];

test('queue copy never waits for the line to stop', () => {
  const offenders = [];
  for (const file of [...walk('src/services/lineplay'), ...walk('src/screens/LinePlay')]) {
    const lines = fs.readFileSync(path.join(root, file), 'utf8').split('\n');
    lines.forEach((line, index) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // comments are not player copy
      if (STOPPED_LINE.some(pattern => pattern.test(line))) offenders.push(`${file}:${index + 1}`);
    });
  }
  assert.deepEqual(offenders, []);
});

function load(file, mocks = {}) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: file,
  }).outputText;
  const moduleRef = { exports: {} };
  vm.runInNewContext(output, { module: moduleRef, exports: moduleRef.exports, require(name) {
    if (name in mocks) return mocks[name];
    throw new Error(`Unexpected dependency: ${name}`);
  } }, { filename: file });
  return moduleRef.exports;
}

test('memory finales never promise turns the game does not have', () => {
  const rideTheme = load('src/services/rideTheme.ts');
  const chapters = load('src/services/lineplay/chapters.ts', { '../rideTheme': rideTheme });
  const rides = [
    [2, 'space-mountain-2', 'Space Mountain'], [8, 'space-mountain-8', 'Space Mountain'],
    [8, 'jungle-cruise-8', 'Jungle Cruise'], [8, 'big-thunder-mountain-railroad-8', 'Big Thunder Mountain Railroad'],
    [1, 'studio-tour-1', 'Studio Tour'], [8, 'pirates-of-the-caribbean-8', 'Pirates of the Caribbean'],
    [2, 'haunted-mansion-2', 'Haunted Mansion'], [8, 'haunted-mansion-8', 'Haunted Mansion'],
  ];
  const adaptive = [];
  for (const name of ['Rocket Coaster', 'River Run', 'Midway Wheel', 'Ghost Manor', 'Film Set Tour']) {
    for (let episode = 0; episode < 3; episode++) adaptive.push([6, undefined, name, episode]);
  }
  let memoryFinales = 0;
  for (const [parkId, slug, name, episode] of [...rides, ...adaptive]) {
    const chapter = chapters.getLinePlayChapter(parkId, slug, name, episode);
    assert.ok(chapter, name);
    if ((chapter.finale.gameId ?? 'memory') !== 'memory') continue;
    memoryFinales += 1;
    assert.doesNotMatch(chapter.finale.preview, /take turns|pass (the|one) phone|share one phone/i, chapter.id);
  }
  assert.ok(memoryFinales >= 8);
});

// Regression (sim, Reduce Motion on): a springified entering animation with
// ReduceMotion.System left the chapter page blank. LinePlay entering
// animations are skipped outright under reduced motion instead.
test('LinePlay entering animations never rely on ReduceMotion.System', () => {
  const offenders = walk('src/screens/LinePlay').filter(file =>
    /ReduceMotion\.System/.test(fs.readFileSync(path.join(root, file), 'utf8')));
  assert.deepEqual(offenders, []);
  const chapterCard = fs.readFileSync(path.join(root, 'src/screens/LinePlay/components/ChapterCard.tsx'), 'utf8');
  assert.match(chapterCard, /useUiReducedMotion\(\)/);
  assert.match(chapterCard, /reduced \? undefined/);
});
