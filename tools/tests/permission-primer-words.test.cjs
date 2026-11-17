const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

// App Review rejected 1.7.3 on Oct 31 2026 (guideline 5.1.1(iv)): a custom
// message shown before an iOS permission prompt must not push the player to
// allow it ("TURN ON LOCATION"). The button that leads to the prompt says
// Continue; after iOS stops asking, Open Settings is fine.
// Each primer: the file, the text that starts it, and how far it runs.
const PRIMERS = [
  ['src/screens/ExploreScreen/PermissionsNotGranted.tsx', 'location', null],
  ['src/screens/SettingsScreen.tsx', 'background location', 'Find rides with your phone locked?'],
  ['src/screens/LinePlay/LinePlayScreen.tsx', 'background location (locked play)', 'Keep LinePlay open to earn Parts.'],
  ['src/components/PushSoftAsk.tsx', 'notifications', null],
  ['src/components/retention/useRetention.tsx', 'notifications (reminders)', 'Want a friendly reminder each day?'],
  ['src/components/trail/TrailSheet.tsx', 'motion (pocket steps)', 'Grown-ups: count pocket steps?'],
];
const PUSHY = /(['">])\s*(Turn On Location|Turn on location|TURN ON LOCATION|Turn On|TURN ON|Turn on|Turn it on|Yes, remind me|YES, REMIND ME|Count my steps)\s*(['"<])/;

test('permission primers: no button pushes the player to allow', () => {
  for (const [file, what, start] of PRIMERS) {
    const source = read(file);
    const at = start ? source.indexOf(start) : 0;
    assert.ok(at >= 0, `${file}: primer text "${start}" not found`);
    const primer = start ? source.slice(at, at + 700) : source;
    const hit = primer.match(PUSHY);
    assert.equal(hit, null, `${file} (${what}) has a pushy button label: ${hit && hit[2]}`);
  }
});

test('location primer: Continue before iOS asks, Open Settings after it stops asking', () => {
  const source = read('src/screens/ExploreScreen/PermissionsNotGranted.tsx');
  assert.match(source, /PRIMER_BUTTON = \{ ask: 'Continue', settings: 'Open Settings', busy: 'One sec…' \}/);
  assert.match(source, /canAsk \? PRIMER_BUTTON\.ask : PRIMER_BUTTON\.settings/);
  assert.equal((source.match(/<YellowButton text=\{buttonText\}/g) || []).length, 2, 'both primer cards use the shared label');
});

test('the other primers lead to iOS with Continue', () => {
  assert.match(read('src/screens/SettingsScreen.tsx'), /confirmLabel: 'Continue',/);
  assert.match(read('src/components/PushSoftAsk.tsx'), />CONTINUE</);
  assert.match(read('src/components/retention/useRetention.tsx'), />CONTINUE</);
  assert.match(read('src/screens/LinePlay/LinePlayScreen.tsx'), /'Checking…' : 'Continue'/);
  assert.match(read('src/components/trail/TrailSheet.tsx'), /label="Continue" size="compact" onPress=\{onAskMotion\}/);
});
