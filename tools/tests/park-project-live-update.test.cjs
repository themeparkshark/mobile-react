const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/screens/ExploreScreen/projectLiveUpdate.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const { projectLiveUpdate, preferFreshProjectSnapshot, projectStageLabel, projectNextMilestone } = moduleRef.exports;
const plainMilestone = input => JSON.parse(JSON.stringify(projectNextMilestone(input)));

const base = {
  park_name: 'Magic Kingdom', stage: 1, total_points: 8, ended: false,
  chapter_a_votes: 2, chapter_b_votes: 1, leading_chapter: 'a',
  chapter_a_title: 'Follow the lighthouse', chapter_b_title: 'Dive under the reef',
};

test('a real stage change outranks a points increase and first load stays quiet', () => {
  assert.equal(projectLiveUpdate(undefined, base), null);
  assert.equal(projectLiveUpdate(base, { ...base, stage: 2, total_points: 15 }),
    'Magic Kingdom: Choose the next current');
});

test('new story stages use their own chapter language', () => {
  const harbor = { ...base, slug: 'echo-harbor-chapter', stage: 2 };
  const lantern = { ...base, slug: 'lantern-tide-chapter', stage: 2 };
  const observatory = { ...base, slug: 'observatory-living-reef', stage: 2 };
  assert.equal(projectStageLabel(harbor), 'Choose the next passage');
  assert.equal(projectStageLabel(lantern), 'Choose the next trail');
  assert.equal(projectStageLabel(observatory), 'Choose the final map');
  assert.equal(projectLiveUpdate({ ...harbor, stage: 1 }, harbor),
    'Magic Kingdom: Choose the next passage');
});

test('community contributions and a vote swing become visible', () => {
  assert.equal(projectLiveUpdate(base, { ...base, total_points: 9 }),
    '+1 signal for Magic Kingdom');
  assert.equal(projectLiveUpdate(base, { ...base, total_points: 11 }),
    '+3 signals for Magic Kingdom');
  assert.equal(projectLiveUpdate(base, { ...base, chapter_b_votes: 3, leading_chapter: 'b' }),
    'New vote leader: Dive under the reef');
  assert.equal(projectLiveUpdate(base, { ...base, chapter_a_votes: 3 }),
    '1 new park vote');
});

test('stale replica snapshots cannot roll the live map backward', () => {
  const current = { ...base, id: 7, stage: 2, total_points: 15, chapter_b_votes: 8 };
  assert.equal(preferFreshProjectSnapshot(current, { ...current, stage: 1 }), current);
  assert.equal(preferFreshProjectSnapshot(current, { ...current, total_points: 14 }), current);
  assert.equal(preferFreshProjectSnapshot(current, { ...current, chapter_b_votes: 7 }), current);
  const advanced = { ...current, total_points: 16 };
  assert.equal(preferFreshProjectSnapshot(current, advanced), advanced);
});

test('old, unchanged, and archived snapshots do not invent a live event', () => {
  assert.equal(projectLiveUpdate(base, base), null);
  assert.equal(projectLiveUpdate(base, { ...base, total_points: 7 }), null);
  assert.equal(projectLiveUpdate(base, { ...base, ended: true, stage: 3 }), null);
});

test('shared progress names the next server stage without promising an impossible clue', () => {
  assert.deepEqual(plainMilestone({ stage: 0, ended: false, total_points: 12, goal_points: 100 }),
    { label: 'FIRST CLUE OPENS', remaining: 22 });
  assert.deepEqual(plainMilestone({ stage: 1, ended: false, total_points: 34, goal_points: 100 }),
    { label: 'COMMUNITY VOTE OPENS', remaining: 33 });
  assert.deepEqual(plainMilestone({ stage: 2, ended: false, total_points: 80, goal_points: 100 }),
    { label: 'STORY FINALE OPENS', remaining: 20 });
  assert.deepEqual(plainMilestone({ stage: 3, ended: false, total_points: 100, goal_points: 100 }),
    { label: 'THE CREW REACHED THE GOAL', remaining: 0 });
  assert.deepEqual(plainMilestone({ stage: 2, ended: true, total_points: 80, goal_points: 100 }),
    { label: 'THIS CHAPTER IS ARCHIVED', remaining: 0 });
});
