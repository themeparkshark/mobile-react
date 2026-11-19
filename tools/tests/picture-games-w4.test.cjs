'use strict';
/**
 * Fix round w4 (lane play-kid) T038 / T223: a child who cannot read yet never meets a reading-only round.
 *   - Welcome has a small grown-up link that turns Picture games on before the first ride try.
 *   - Turning Picture games on from the Beat the Buzzer card at a try's start deals that same try again as a
 *     picture game (round w3 only changed the NEXT try, so the first round stayed trivia).
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const { loadTs } = require('./helpers/ts-module.cjs');

const R = loadTs('src/services/task-attempt/pictureRedeal.ts');
const modal = fs.readFileSync('src/components/RedeemRedeemableModal.tsx', 'utf8');
const welcome = fs.readFileSync('src/screens/WelcomeScreen.tsx', 'utf8');
const link = fs.readFileSync('src/components/help/PictureGamesLink.tsx', 'utf8');
const card = fs.readFileSync('src/components/help/GameIntroCard.tsx', 'utf8');

const base = { flowState: 'minigame', pictureOnlyNow: true, pictureOnlyTry: false, attempt: { status: 'started', game: 'trivia' }, busy: false };

test('T038: a started trivia try whose player just turned Picture games on is dealt again, once', () => {
  assert.equal(R.shouldRedealPicture(base), true);
  assert.equal(R.shouldRedealPicture({ ...base, pictureOnlyTry: true }), false, 'already a picture try: never again');
  assert.equal(R.shouldRedealPicture({ ...base, busy: true }), false);
  assert.equal(R.shouldRedealPicture({ ...base, pictureOnlyNow: false }), false);
  assert.equal(R.shouldRedealPicture({ ...base, attempt: { status: 'started', game: 'tap' } }), false);
  assert.equal(R.shouldRedealPicture({ ...base, attempt: { status: 'lost', game: 'trivia' } }), false, 'a finished try is never re-dealt');
  assert.equal(R.shouldRedealPicture({ ...base, flowState: 'postwin' }), false);
  assert.equal(R.shouldRedealPicture({ ...base, attempt: null }), false);
});

test('T038: the re-deal sends a new request id with picture_only through the normal spend path (no new Ticket)', () => {
  assert.match(modal, /await writeTaskAttemptCheckpoint\(\{ \.\.\.saved, pictureOnly: true,\n\s+requestId: `tps-/);
  assert.match(modal, /setRedealt\(true\);\n\s+await handleStartWheel\(\);/);
  assert.match(modal, /redealt \? 'Picture game\. No new Ticket\.'/);
  assert.doesNotMatch(card, /Next try is a picture game/, 'the card no longer says only the next try changes');
});

test('T038: Welcome carries the small grown-up Picture games link (shown only while the server switch is on)', () => {
  assert.match(welcome, /<PictureGamesLink \/>/);
  assert.match(link, /if \(!play\.available \|\| player\?\.id == null\) return null;/);
  assert.match(link, /onPress=\{\(\) => play\.setPictureOnly\(!on\)\}/, 'a choice: a crew default never undoes it');
  assert.match(link, /off: 'Little one playing\? Picture games'/);
});
