'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');
const copy = loadTs('src/gamekit/party/resultCopy.ts');

const row = (seat, score, placement, extra = {}) => ({ seat, kind: 'human', score, placement, points: 0, filled_by: null, filled_from_ms: null, verdict: 'ok', stats: {}, name: 'x', avatar_url: null, team: null, ...extra });

test('a loss teaches: margin to the place above plus the key moment', () => {
  const results = [row(0, 5200, 1), row(1, 5060, 2, { key_moment: { kind: 'lure', bar: 10, at: 16000, cost: 410, byMs: 0 } }), row(2, 3000, 3)];
  assert.equal(copy.lossLine(results[1], results), 'Lost 1st by 140. A lure cost you 410.');
  assert.equal(copy.lossLine(results[0], results), null, '1st place gets no lesson');
  assert.equal(copy.keyMomentLine({ kind: 'snatch_missed', bar: 6, at: 8823, cost: 200, byMs: 30 }), 'So close! You just missed a snatch.');
  assert.equal(copy.lossLine(row(3, 0, 4, { verdict: 'ghost_finished:hold' }), results), null, 'safety hand-offs never sting');
  assert.equal(copy.lossLine(row(3, 0, 4, { verdict: 'no_contest:desync' }), results), null);
  assert.equal(copy.nearMiss(row(1, 5100, 2, { verdict: 'ghost_finished:walk' }), [row(0, 5200, 1)]), false);
  assert.equal(copy.keyMomentLine({ kind: 'splashed', bar: 9, at: 15000, cost: 260, byMs: 0 }), 'You got splashed: -260.');
});

test('REMATCH is bigger only under a 10% margin', () => {
  const results = [row(0, 5000, 1), row(1, 4600, 2), row(2, 4400, 3)];
  assert.equal(copy.nearMiss(results[1], results), true);
  assert.equal(copy.nearMiss(results[2], results), false);
});

test('Star Player labels, and no emoji or em dashes anywhere in party copy', () => {
  assert.equal(copy.starLabel({ category: 'snatches', value: 2 }), '2 SNATCHES');
  assert.equal(copy.starLabel({ category: 'best_bar', value: 620, bar: 7 }), 'BEST STRETCH  620 POINTS');
  const fs = require('node:fs');
  const path = require('node:path');
  const dir = path.resolve(__dirname, '../../src/gamekit/party');
  for (const f of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, f), 'utf8');
    assert.ok(!text.includes('—'), `${f} has an em dash`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(text), `${f} has an emoji`);
    // Player copy never says "server" (design 13.8): only string literals are checked, not comments.
    const code = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const strings = code.match(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g) ?? [];
    for (const lit of strings) assert.ok(!/server/i.test(lit) || /server_ms|serverNow|server_/.test(lit), `${f}: ${lit}`);
  }
});
