const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const ts = require(path.join(root, 'node_modules/typescript'));
const file = 'src/services/lineplay/presentation.ts';
const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const moduleRef = { exports: {} };
vm.runInNewContext(code, { module: moduleRef, exports: moduleRef.exports }, { filename: file });
const { linePlayPages, queueArcadeDestinations } = moduleRef.exports;
const promptFile = 'src/services/lineplay/livePrompt.ts';
const promptCode = ts.transpileModule(fs.readFileSync(path.join(root, promptFile), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const promptModule = { exports: {} };
vm.runInNewContext(promptCode, { module: promptModule, exports: promptModule.exports }, { filename: promptFile });
const { crewLivePrompt } = promptModule.exports;

test('a new wait opens on the chapter, Crew Prompts closes it, late shared pages do not shift the list', () => {
  const playlist = [
    { kind: 'chapter_intro', id: 'intro' },
    { kind: 'crew_relay', id: 'relay' },
    { kind: 'crew_grid', id: 'grid' },
    { kind: 'trivia', id: 'trivia' },
    { kind: 'minigame', id: 'game' },
  ];
  const before = linePlayPages(playlist);
  const after = linePlayPages(playlist, [
    { kind: 'signal', id: 'crew-signal' },
    { kind: 'puzzle', id: 'crew-puzzle' },
  ]);
  assert.deepEqual(Array.from(before, page => page.id), ['intro', 'relay', 'trivia', 'game', 'grid']);
  assert.deepEqual(Array.from(after.slice(0, before.length), page => page.id),
    Array.from(before, page => page.id));
  assert.deepEqual(Array.from(after.slice(before.length), page => page.id), ['crew-signal', 'crew-puzzle']);
  assert.deepEqual(playlist.map(page => page.id), ['intro', 'relay', 'grid', 'trivia', 'game']);
});

test('a ride without a chapter keeps its first real activity first', () => {
  const pages = linePlayPages([{ kind: 'minigame', id: 'tap' }, { kind: 'trivia', id: 'trivia' }]);
  assert.deepEqual(Array.from(pages, page => page.id), ['tap', 'trivia']);
});

test('arcade shortcut reaches distinct games and favors unfinished rounds', () => {
  const pages = [
    { kind: 'chapter_intro', id: 'intro' },
    { kind: 'minigame', id: 'old-trivia', gameId: 'trivia' },
    { kind: 'trivia', id: 'single-clue' },
    { kind: 'minigame', id: 'swim', gameId: 'shark' },
    { kind: 'minigame', id: 'new-trivia', gameId: 'trivia' },
  ];
  const choices = queueArcadeDestinations(pages, new Set(['old-trivia']));
  assert.deepEqual(Array.from(choices, choice => [choice.id, choice.index, choice.completed]), [
    ['new-trivia', 4, false], ['swim', 3, false],
  ]);
});

test('the visible live action advances from vote to player unlocked game to shared puzzle', () => {
  const base = { park_day: '2026-09-24', participants: 2, community_target: 3,
    player_choice: null, can_choose: true, unlocked_route: null, solo_route: null, puzzle: null };
  assert.equal(crewLivePrompt(base, new Set()).pageId, 'crew-signal');
  assert.match(crewLivePrompt(base, new Set()).title, /Choose/);
  const waiting = { ...base, can_choose: false, seconds_until_eligible: 45 };
  assert.match(crewLivePrompt(waiting, new Set()).title, /Play now/);
  assert.equal(crewLivePrompt(waiting, new Set()).action, 'SEE CREW PATH');
  const soloPending = { ...base, can_choose: false, player_choice: 'route_a', seconds_until_solo: 120 };
  assert.match(crewLivePrompt(soloPending, new Set()).title, /path opens/);
  assert.equal(crewLivePrompt(soloPending, new Set()).action, 'SEE YOUR PATH');
  const opened = { ...base, participants: 3, unlocked_route: 'route_b',
    puzzle: { stage: 1, total_stages: 3, completed: false } };
  assert.match(crewLivePrompt(opened, new Set()).title, /Starlight Route/);
  assert.match(crewLivePrompt(opened, new Set()).action, /WHACK-A-SHARK/);
  const completed = new Set(['signal-bonus-2026-09-24-route_b']);
  assert.equal(crewLivePrompt(opened, completed).pageId, 'crew-puzzle');
  assert.match(crewLivePrompt(opened, completed).title, /Codebreaker · 1\/3/);
});
