// Lane app-tickets, fix pass 1 (Nov 20 2026): P13, P19, P20, P14, P23 and the Get Tickets hand-offs.
const assert = require('node:assert/strict');
const test = require('node:test');
const { read } = require('./helpers/load-ts.cjs');

test('P13 the unwon coin card is anchored on a real view, so it opens centered from any shelf slot', () => {
  // Every sheet is drawn in a window overlay placed from its parent's native frame (ui/OverlaySheet.tsx). A shelf
  // slot's wrappers are layout only and get flattened, which put the card and its backdrop at the slot's offset.
  const src = read('src/components/UnfoundCoinModal.tsx');
  const anchorAt = src.indexOf('<View collapsable={false} pointerEvents="box-none" style={styles.modalAnchor}>');
  const modalAt = src.indexOf('<Modal', anchorAt);
  assert.ok(anchorAt > 0, 'the card has a non-collapsable anchor view');
  assert.ok(modalAt > anchorAt && !src.slice(anchorAt, modalAt).includes('</View>'), 'the Modal sits inside the anchor');
  assert.ok(src.indexOf('</Modal>\n      </View>') > modalAt, 'the anchor closes right after the Modal');
  assert.match(src, /modalAnchor: \{ position: 'absolute', top: 0, left: 0, width: 0, height: 0 \}/);
  // It can always be closed: the backdrop, a swipe and Not now (or Got It!) all close it.
  assert.match(src, /onBackdropPress=\{\(\) => setVisible\(false\)\}/);
  assert.match(src, /onSwipeComplete=\{\(\) => setVisible\(false\)\}/);
  assert.match(src, />Not now</);
  assert.match(src, /text="Got It!" onPress=\{\(\) => setVisible\(false\)\}/);
});
