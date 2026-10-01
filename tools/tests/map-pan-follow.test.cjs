const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '../../src/components/Map.tsx'), 'utf8');

test('a finger on the map drops follow at gesture start, so GPS ticks cannot yank the camera mid-drag', () => {
  const willChange = source.slice(source.indexOf('onRegionWillChange='), source.indexOf('onDidFinishRenderingMapFully'));
  assert.match(willChange, /isUserInteraction/);
  assert.match(willChange, /followRef\.current = false/);
  assert.match(willChange, /setFocusedOnPlayer\(false\)/);
});

test('a pinch that leaves the shark centered resumes following; a real pan does not', () => {
  const didChange = source.slice(source.indexOf('onRegionDidChange='), source.indexOf('<Camera', source.indexOf('onRegionDidChange=')));
  assert.match(didChange, /followRef\.current = true/);
  assert.match(didChange, /0\.00007/);
  assert.doesNotMatch(didChange, /> 0\.0005/);
});

test('both shark copies stay mounted and swap by opacity, so dragging never reloads the outfit', () => {
  assert.match(source, /opacity: focusedOnPlayer \? 0 : 1/);
  assert.match(source, /opacity: focusedOnPlayer \? 1 : 0/);
  assert.doesNotMatch(source, /location && !focusedOnPlayer && \(/);
  assert.doesNotMatch(source, /location && focusedOnPlayer && \(/);
});
