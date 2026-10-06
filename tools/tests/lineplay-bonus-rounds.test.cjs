const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const bonus = loadTs('src/services/lineplay/bonusRounds.ts');
const logic = loadTs('src/games/current-quest/v1/logic.ts');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function summary(overrides = {}) {
  return {
    enabled: true,
    slots: [
      { index: 1, opens_at_eligible_seconds: 300, state: 'claimed', source: 'current_quest' },
      { index: 2, opens_at_eligible_seconds: 900, state: 'open', source: null },
      { index: 3, opens_at_eligible_seconds: 1500, state: 'locked', source: null },
    ],
    next_opens_at_eligible_seconds: 1500,
    saved: null,
    claimed_now: [],
    encore_now: [],
    perks_now: [],
    coin_day_done: false,
    remaining_coin_day: 3,
    remaining_park_day: 11,
    encore: { xp: 10, energy: 5, floor_xp: 5, session_left: 6, park_day_left: 12 },
    sources: { current_quest: true, crew_puzzle: true, trivia: false },
    motion: { moving: false, left_line: false },
    ...overrides,
  };
}

test('the gem prediction counts down between heartbeats and charges at zero', () => {
  const s = summary({ slots: [], next_opens_at_eligible_seconds: 300 });
  assert.equal(bonus.nextBonusSeconds(s, 280, 1_000_000, 1_000_000), 20);
  assert.equal(bonus.nextBonusSeconds(s, 280, 1_000_000, 1_015_000), 5);
  assert.equal(bonus.nextBonusSeconds(s, 280, 1_000_000, 1_030_000), 0, 'CHARGED, waiting for the server pop');
  // A stale sample stops predicting rather than racing ahead.
  assert.equal(bonus.nextBonusSeconds(s, 280, 1_000_000, 1_200_000), 20);
  assert.equal(bonus.nextBonusSeconds(summary({ next_opens_at_eligible_seconds: null }), 280, 0, 0), null);
  assert.deepEqual(plain(bonus.forcedHeartbeatDelaysMs(20)), [22_000, 25_000]);
});

test('the pip row draws only real slots and says when this ride is done for the day', () => {
  assert.deepEqual(plain(bonus.visiblePips(summary())), ['claimed', 'open', 'future']);
  const shrunk = summary({ slots: [
    { index: 1, opens_at_eligible_seconds: 300, state: 'hidden', source: null },
    { index: 2, opens_at_eligible_seconds: 900, state: 'open', source: null },
    { index: 3, opens_at_eligible_seconds: 1500, state: 'hidden', source: null },
  ] });
  assert.deepEqual(plain(bonus.visiblePips(shrunk)), ['open']);
  assert.equal(bonus.bonusDoneToday(summary({ coin_day_done: true })), true);
  assert.deepEqual(plain(bonus.visiblePips(null)), []);
  assert.equal(bonus.ringPill(summary()), 'BONUS OPEN');
  assert.equal(bonus.ringPill(summary({ slots: [], saved: { source: 'current_quest', saved_at: null } })), 'WIN SAVED');
});

test('picker badges promise exactly what a win pays now, with no fractions', () => {
  assert.equal(bonus.pickerBadge(summary(), 252).text, 'BONUS');
  const waiting = summary({ slots: [{ index: 1, opens_at_eligible_seconds: 300, state: 'locked', source: null }] });
  assert.equal(bonus.pickerBadge(waiting, 252).text, 'Win now. Part in 4:12');
  const saved = { ...waiting, saved: { source: 'current_quest', saved_at: null } };
  assert.equal(bonus.pickerBadge(saved, 252).text, 'Win saved. Next bonus in 4:12');
  assert.equal(bonus.pickerBadge(saved, 252).reward, '+10 XP');
  const after = summary({ slots: [], next_opens_at_eligible_seconds: null });
  assert.equal(bonus.pickerBadge(after, null).text, 'ENCORE +10 XP');
  const floor = { ...after, encore: { ...after.encore, session_left: 0 } };
  assert.equal(bonus.pickerBadge(floor, null).text, 'ENCORE +5 XP');
  // The source that has not claimed this session goes first.
  assert.deepEqual(plain(bonus.pickerOrder(summary(), ['current_quest', 'crew_puzzle'])), ['crew_puzzle', 'current_quest']);
});

test('a claim celebrates once: replays and restarts never replay the flight', () => {
  const claim = { index: 2, source: 'current_quest', parts: 1 };
  const first = bonus.takeNewBonusEvents('s1', summary({ claimed_now: [claim] }), []);
  assert.equal(first.claims.length, 1);
  const replay = bonus.takeNewBonusEvents('s1', summary({ claimed_now: [claim] }), first.seen);
  assert.equal(replay.claims.length, 0);
  // After a restart the snapshot shows slot 1 already claimed: never celebrated late.
  const restart = bonus.takeNewBonusEvents('s1', summary({ claimed_now: [{ index: 1, source: 'crew_puzzle', parts: 1 }] }),
    bonus.takeNewBonusEvents('s1', summary(), []).seen);
  assert.equal(restart.claims.length, 0);
  assert.deepEqual(plain(['C', 'D', 'E']), [1, 2, 3].map(bonus.absorbPitch));
});

test('walking defers haptics and stings, plays them when the line stops, drops them when 3 s late', () => {
  const gate = new bonus.MovementFxGate();
  assert.equal(gate.offer('a', 0), 'play');
  gate.setMoving(true, 0);
  assert.equal(gate.offer('absorb', 1_000), 'deferred');
  assert.equal(gate.offer('late', 0), 'deferred');
  assert.deepEqual(plain(gate.setMoving(false, 3_500)), ['absorb']);
  assert.deepEqual(plain(gate.setMoving(false, 4_000)), []);
});

test('leaving the line needs 2 m/s sustained for 20 s; queue walking and one spike never count', () => {
  const walk = new bonus.ExitSpeedDetector();
  for (let t = 0; t <= 120_000; t += 5_000) assert.equal(walk.feed({ timestamp: t, speedMps: 1.4, accuracyMeters: 5 }), false);
  const spike = new bonus.ExitSpeedDetector();
  assert.equal(spike.feed({ timestamp: 0, speedMps: 9, accuracyMeters: 5 }), false);
  assert.equal(spike.feed({ timestamp: 30_000, speedMps: 1, accuracyMeters: 5 }), false);
  assert.equal(spike.feed({ timestamp: 60_000, speedMps: 9, accuracyMeters: 40 }), false, 'a noisy fix is ignored');
  const tram = new bonus.ExitSpeedDetector();
  assert.equal(tram.feed({ timestamp: 0, speedMps: 3, accuracyMeters: 5 }), false);
  assert.equal(tram.feed({ timestamp: 10_000, speedMps: 3, accuracyMeters: 5 }), false);
  assert.equal(tram.feed({ timestamp: 20_000, speedMps: 3, accuracyMeters: 5 }), true);
  assert.equal(bonus.isWalkingSample({ timestamp: 0, speedMps: 0.8 }), true);
  assert.equal(bonus.isWalkingSample({ timestamp: 0, speedMps: 0.1 }), false);
});

test('the recap rows tick Wait, Bonus, Mastery and Encore, and the park-day line stays on the recap', () => {
  const rows = bonus.recapRows({ parts: 6, liveParts: 3, bonusRoundParts: 2, masteryBonusParts: 1,
    encoreXp: 10, encoreEnergy: 5, bonusParkDayUsed: 5, bonusParkDayCap: 12 });
  assert.deepEqual(plain(rows.map(row => `${row.label} ${row.value}`)),
    ['Wait Parts x3', 'Bonus Parts x2', 'Mastery x1', 'Encore +10 XP  +5 ENERGY']);
  assert.equal(bonus.parkDayLine({ parts: 0, bonusParkDayUsed: 5, bonusParkDayCap: 12 }), 'Bonus today: 5 of 12');
  assert.deepEqual(plain(bonus.recapRows({ parts: 2, liveParts: 2, bonusRoundParts: 0 }).map(row => row.key)), ['wait', 'bonus']);
  assert.equal(bonus.ringInfoCopy(600, 12, true),
    'You get 1 Ride Part every 10 minutes near the ride, up to 12 per wait. Win bonus games for up to 3 more.');
});

test('Current Quest tiers mirror the server replay exactly', () => {
  // Same numbers as LinePlayBonusRoundsTest on the backend.
  assert.deepEqual([0, 1, 2].map(level => logic.makeCurrentBoard(314159, level).rocks.length), [2, 4, 6]);
  assert.deepEqual([0, 1, 2].map(level => logic.makeCurrentBoard(314159, level, 'easy').rocks.length), [1, 2, 4]);
  assert.deepEqual([0, 1].map(level => logic.makeCurrentBoard(314159, level, 'breeze').rocks.length), [1, 2]);
  assert.deepEqual(plain(logic.makeCurrentBoard(4294967295, 2).rocks), [2, 4, 7, 10, 17, 20]);
  assert.equal(logic.CURRENT_TIERS.breeze.voyages, 2);
});

test('games never pause for walking: GameShellV2 is passive unless a preview opts in', () => {
  const context = loadTs('src/gamekit/LinePlayMovementContext.ts', { react: { createContext: value => ({ value }) } });
  assert.equal(context.shouldPauseForMovement({ moving: true }), false);
  assert.equal(context.shouldPauseForMovement({ moving: true, lineMovePolicy: 'passive' }), false);
  assert.equal(context.shouldPauseForMovement({ moving: true, lineMovePolicy: 'pause' }), true);
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /lineMovePolicy: 'passive'/);
  assert.doesNotMatch(screen, /lineMovePolicy: 'pause'/);
  assert.doesNotMatch(read('src/services/lineplay/LinePlaySession.ts'), /pause\('lineMoving'\)/);
});

test('client-scored wins never fly a Part: only server bonus events feed the flight', () => {
  const screen = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.match(screen, /event=\{fxHead && fxHead\.kind !== 'perk' \? fxHead : null\}/);
  assert.match(screen, /activeGame\.gameId !== 'current' \? \{\s*text: 'Play Current Quest or Codebreaker for bonus Parts'/);
  const session = read('src/services/lineplay/LinePlaySession.ts');
  // Only applyBonus (server responses) pushes celebrations.
  assert.equal((session.match(/this\.bonusFx\.push/g) ?? []).length, 3);
  assert.match(session, /const events = takeNewBonusEvents\(sessionId, next, this\.bonusSeen\)/);
});

test('Echo seats are synthetic, at most two, and never named like a real player', () => {
  const card = read('src/screens/LinePlay/components/CrewPuzzleCard.tsx');
  assert.match(card, /const ECHO_WORDS = \['Reef', 'Tide'/);
  assert.match(card, /'Crack it with Captain Fin'/);
  assert.doesNotMatch(card, /waiting for players/i);
});

test('no emoji and no em dashes in the queue bonus strings', () => {
  const files = [
    'src/services/lineplay/bonusRounds.ts', 'src/services/lineplay/bonusCues.ts',
    'src/screens/LinePlay/components/BonusPicker.tsx', 'src/screens/LinePlay/components/BonusPartFlight.tsx',
    'src/screens/LinePlay/components/WaitCard.tsx', 'src/screens/LinePlay/components/CrewPuzzleCard.tsx',
    'src/screens/LinePlay/components/LinePlayLiveRail.tsx', 'src/screens/LinePlay/components/SessionRecap.tsx',
    'src/gamekit/LinePlayMovementContext.ts',
    'src/screens/LinePlay/LinePlayScreen.tsx', 'src/services/lineplay/LinePlaySession.ts',
  ];
  for (const file of files) {
    const source = read(file);
    assert.doesNotMatch(source, /—/, `${file} has an em dash`);
    assert.doesNotMatch(source, /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u, `${file} has an emoji`);
  }
});
