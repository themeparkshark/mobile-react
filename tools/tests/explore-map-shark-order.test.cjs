const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');

test('the panned-away player shark draws after the ride islands so it is never hidden under one', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/components/Map.tsx'), 'utf8');
  const children = src.indexOf('{children}</MapQueryContext.Provider>');
  // Always mounted (hidden until the first fix): no MapView child mounts mid-list.
  const shark = src.indexOf('<PlayerSharkMarker target={location ?? null}');
  assert.ok(children > 0 && shark > 0);
  assert.ok(shark > children, 'shark marker is rendered after the map children');
});
