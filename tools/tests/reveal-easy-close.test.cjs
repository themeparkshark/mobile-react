'use strict';
/** Reward reveals close easily without wearing anything (Dustin, Oct 5: "it would be nice to tap off easier"). */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('every reward reveal closes easily without wearing anything (Dustin: "tap off easier")', () => {
  const reveal = read('src/screens/StoreScreen/SetCompleteReveal.tsx');
  // Shop set: WEAR IT ALL stays the main action; a real second button leaves.
  assert.ok(reveal.indexOf('<ShopCta label={allCopy.label}') < reveal.indexOf('leaveLabel(all === \'done\''), 'Wear it all comes first');
  assert.match(reveal, /accessibilityLabel="Close"/, 'an X in the corner');
  // Panel r1: a full-screen reveal has no outside; a tap in a gap between its parts never closes it.
  assert.doesNotMatch(reveal, /StyleSheet\.absoluteFill\} onPress=\{\(\) => leave/);
  assert.doesNotMatch(reveal, /pointerEvents="box-none" style=\{\[styles\.content/);
  // Not now sits where the buy button was: it waits out the guard like the swipe.
  assert.match(reveal, /onPress=\{\(\) => leave\(true\)\} disabled=\{waiting\}/);
  // Leaving mid-save waits for it: closes on success, stays for "Try again" on failure.
  assert.match(reveal, /if \(saving\.current > 0\) \{ leaveAfterSave\.current = true; setWaiting\(true\); return; \}/);
  assert.match(reveal, /if \(ok && leaveAfterSave\.current\) \{ doneRef\.current\(\); return; \}/);
  assert.match(reveal, /catch \{ setAll\(s => wearAllNext\(s, 'fail'\)\); settle\(false\); \}/);
  assert.match(reveal, /catch \{ setTitleOnly\('failed'\); settle\(false\); \}/);
  assert.match(reveal, /PanResponder\.create/, 'swipe down');
  assert.match(reveal, /onRequestClose=\{\(\) => leave\(false\)\}/, 'Android back');
  assert.doesNotMatch(reveal, />Awesome!</, 'no ambiguous "Awesome!" link');
  const ts = require(path.join(root, 'node_modules/typescript'));
  const fnSrc = reveal.slice(reveal.indexOf('export function leaveLabel'), reveal.indexOf('}', reveal.indexOf('export function leaveLabel')) + 1);
  const leaveLabel = new Function(`${ts.transpile(fnSrc.replace("export ", ""))}; return leaveLabel;`)();
  assert.equal(leaveLabel(false, false), 'Not now');
  assert.equal(leaveLabel(true, false), 'Done');
  assert.equal(leaveLabel(false, true), 'Done');
  const consts = reveal.slice(reveal.indexOf('export const SWIPE_CLOSE_DY'), reveal.indexOf('}', reveal.indexOf('export function swipeCloses')) + 1)
    .replace(/export /g, '');
  const swipeCloses = new Function(`${ts.transpile(consts)}; return swipeCloses;`)();
  assert.equal(swipeCloses(150, 10, 0.3), true, 'a long drag down');
  assert.equal(swipeCloses(90, 5, 0.4), false, 'a short drag (the old threshold) stays');
  assert.equal(swipeCloses(70, 5, 1.8), true, 'a real flick');
  assert.equal(swipeCloses(30, 2, 2.5), false, 'a flick too short to mean it');
  assert.equal(swipeCloses(160, 120, 0.5), false, 'a diagonal drag is not a swipe down');
  assert.equal(swipeCloses(-200, 0, -2), false);
  // The hooks sit above the early return (rules of hooks).
  assert.ok(reveal.indexOf('const swipe = useRef(PanResponder') < reveal.indexOf('if (!reward) return null;'));
  // Book and stamp reveals already close every way: backdrop tap plus their button, and the stamp card's X.
  const book = read('src/screens/SetCollection/DexReveal.tsx');
  assert.match(book, /accessibilityLabel="Dismiss" onPress=\{backdrop\}/);
  const stamp = read('src/screens/stampbook/StampCard.tsx');
  assert.match(stamp, /<Pressable style=\{StyleSheet\.absoluteFill\} onPress=\{onClose\}/);
  assert.match(stamp, /accessibilityLabel="Close"/);
  const claim = read('src/screens/SetCollection/SetHuntSections.tsx');
  assert.match(claim, /label="Dismiss" variant="ghost"/, 'the book claim card has its own Dismiss next to Wear it');
});
