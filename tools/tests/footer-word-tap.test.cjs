// Hotfix wave 5: the word under each footer icon ("PROFILE", "NEWS") is part of the button.
// Found on device while re-walking the ship-gate share freeze path: a tap on the word itself
// landed on a plain <Text> outside the icon's Pressable, so the map looked like it ignored the tap.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '../../src/components/Wrapper.tsx'), 'utf8');

test('footer icon and its word go through the same goTo handler', () => {
  assert.match(src, /const goTo = \(item: \{ screen: string; permission\?: PermissionEnums \}\) => \{/);
  assert.match(src, /<Button[\s\S]*?onPress=\{\(\) => goTo\(item\)\}/);
  const label = src.slice(src.indexOf('The word under the icon is part of the button too'));
  assert.match(label, /<(?:Upper)?Text\s+onPress=\{\(\) => \{ playSound\(item\.sound\); goTo\(item\); \}\}/);
  assert.match(label, /accessibilityRole="button"/);
  assert.match(label, /suppressHighlighting/);
});

test('goTo keeps the catch guard, tab reselect and the Profile permission check', () => {
  const body = src.slice(src.indexOf('const goTo ='), src.indexOf('const items = ['));
  assert.match(body, /if \(isCatchShown\(\)\) return;/);
  assert.match(body, /emitTabReselect\(item\.screen\)/);
  assert.match(body, /checkPermission\(item\.permission\)/);
  assert.match(body, /onNavigate\(item\.screen\)/);
});

// The map's PLAY RIDE! holder reaches 50 pt down over the tab bar with zIndex 10. Fabric flattens
// its plain parent views, so the zIndex lifted the whole holder above the bar: STANDINGS, the map
// compass and SOCIAL ignored every tap on the map while PLAY RIDE! showed (found on device, Oct 24).
test('the map PLAY RIDE! holder lets taps through to the tab bar', () => {
  const explore = fs.readFileSync(path.join(__dirname, '../../src/screens/ExploreScreen.tsx'), 'utf8');
  const at = explore.indexOf('<RedeemModal');
  assert.ok(at > 0);
  const holder = explore.slice(explore.lastIndexOf('<View', at), at);
  assert.match(holder, /bottom: -50/);
  assert.match(holder, /zIndex: 10/);
  assert.match(holder, /pointerEvents="box-none"/);
});
