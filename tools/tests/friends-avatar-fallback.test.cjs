const assert = require('node:assert/strict'), test = require('node:test');
const fs = require('node:fs'), path = require('node:path');
const { runtime } = require('./helpers/reward-hook-runtime.cjs');

// QA P2-7: wavepal59 and turkeylegend showed black or white blobs in friend
// suggestions, and VoiceOver found the swipe buttons offscreen at x of -9663.
function avatar(player) {
  return runtime('src/components/Avatar.tsx', {
    '../context/AuthProvider': { AuthContext: { value: { player: null } } },
    '../helpers/wardrobe': { liveOutfitFor: (p) => p.inventory, outfitLayerUrls: () => [], hasDressedShark: () => false, sharkBaseLayers: () => [] },
    '../config': { default: { secondary: '#00f', lightBlue: '#0af' } },
  }, { player, size: 'md' });
}
const photo = app => app.find(node => node.type === 'Image' && node.props.placeholder);

test('a photo that fails to load falls back to the TPS shark', () => {
  const app = avatar({ id: 15, screen_name: 'wavepal59', avatar_url: 'http://localhost/storage/users/15/avatar/x.png' });
  assert.equal(photo(app).props.source, 'http://localhost/storage/users/15/avatar/x.png');
  photo(app).props.onError(); app.render();
  assert.equal(photo(app).props.source, photo(app).props.placeholder, 'the default portrait, not a blob');
  app.change({ player: { id: 15, screen_name: 'wavepal59', avatar_url: 'http://cdn/new.png' } });
  assert.equal(photo(app).props.source, 'http://cdn/new.png', 'a new photo gets its own chance');
});

test('no photo shows the TPS shark', () => {
  const app = avatar({ id: 9, screen_name: 'pal', avatar_url: null });
  assert.equal(photo(app).props.source, photo(app).props.placeholder);
});

test('friend rows have no hidden swipe actions and every visible button is labelled', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../src/screens/social/PlayerRow.tsx'), 'utf8');
  assert.doesNotMatch(src, /Swipeable/, 'no gesture-only actions a kid or VoiceOver cannot find');
  assert.match(src, /accessibilityLabel=\{`Say yes to \$\{player\.screen_name\}`\}/);
  assert.match(src, /accessibilityLabel=\{`Say no to \$\{player\.screen_name\}`\}/);
  assert.match(src, /Send \$\{player\.screen_name\} a heart and 5 coins/);
  assert.match(src, /accessibilityHint="Opens their profile"/);
});
