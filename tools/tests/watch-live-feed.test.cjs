// Watch page live YouTube feed: NEW badge window, newest-first order, kid-safe
// embed (youtube-nocookie, rel=0) and a player that cannot leave for youtube.com.
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');

const feed = loadTs('src/components/watch/watchFeed.ts', {}, { Number, String, Error });
const NOW = Date.parse('2026-10-04T12:00:00Z');
const video = (over = {}) => ({ id: 1, title: 't', image_url: 'https://i.ytimg.com/vi/abcdefghijk/maxresdefault.jpg', permalink: 'https://www.youtube.com/watch?v=abcdefghijk', has_watched: false, ...over });

test('NEW shows for the first 24 hours only, and never without a date', () => {
  assert.equal(feed.isNewVideo(video({ published_at: '2026-10-04T11:00:00+00:00' }), NOW), true);
  assert.equal(feed.isNewVideo(video({ published_at: '2026-10-03T12:00:01+00:00' }), NOW), true);
  assert.equal(feed.isNewVideo(video({ published_at: '2026-10-03T11:59:59+00:00' }), NOW), false);
  assert.equal(feed.isNewVideo(video({}), NOW), false);
  assert.equal(feed.isNewVideo(video({ published_at: 'garbage' }), NOW), false);
});

test('videos sort newest first; undated ones keep server order at the end', () => {
  const list = [
    video({ id: 1, published_at: '2026-09-01T00:00:00Z' }),
    video({ id: 2 }),
    video({ id: 3, published_at: '2026-10-03T00:00:00Z' }),
    video({ id: 4 }),
  ];
  assert.deepEqual(feed.sortNewestFirst(list).map(v => v.id), [3, 1, 2, 4]);
});

test('the video id comes from the API or, for old payloads, the permalink', () => {
  assert.equal(feed.videoIdOf(video({ video_id: 'Vdiom632yME' })), 'Vdiom632yME');
  assert.equal(feed.videoIdOf(video({ permalink: 'https://www.youtube.com/watch?v=Vdiom632yME' })), 'Vdiom632yME');
  assert.equal(feed.videoIdOf(video({ permalink: 'https://www.youtube.com/shorts/1Ok43mjRajw' })), '1Ok43mjRajw');
  assert.equal(feed.videoIdOf(video({ permalink: 'https://example.com/x' })), null);
});

test('the embed is privacy-enhanced with rel=0 and no way to inject markup', () => {
  const url = feed.embedUrl('Vdiom632yME');
  assert.match(url, /^https:\/\/www\.youtube-nocookie\.com\/embed\/Vdiom632yME\?/);
  assert.match(url, /[?&]rel=0(&|$)/);
  assert.match(url, /[?&]playsinline=1(&|$)/);
  assert.match(feed.embedHtml('Vdiom632yME'), /referrerpolicy="strict-origin-when-cross-origin"/);
  assert.throws(() => feed.embedHtml('"><script>alert(1)</script>'));
});

test('the player never navigates its top frame to youtube.com or elsewhere', () => {
  assert.equal(feed.allowPlayerNavigation('https://themeparkshark.com/', true), true);
  assert.equal(feed.allowPlayerNavigation('about:blank', true), true);
  assert.equal(feed.allowPlayerNavigation('https://www.youtube-nocookie.com/embed/Vdiom632yME?rel=0', true), true);
  assert.equal(feed.allowPlayerNavigation('https://www.youtube.com/watch?v=Vdiom632yME', true), false);
  assert.equal(feed.allowPlayerNavigation('https://m.youtube.com/', true), false);
  assert.equal(feed.allowPlayerNavigation('https://themeparkshark.com/some-article/', true), false);
  // The iframe's own loads (player scripts, video) are not top-frame navigations.
  assert.equal(feed.allowPlayerNavigation('https://www.youtube.com/s/player/x.js', false), true);
});

test('durations format like YouTube and grid cards use the 16:9 thumbnail', () => {
  assert.equal(feed.formatDuration(65), '1:05');
  assert.equal(feed.formatDuration(3723), '1:02:03');
  assert.equal(feed.formatDuration(0), null);
  assert.equal(feed.formatDuration(null), null);
  const v = video({ thumbnail_url: 'https://i.ytimg.com/vi/x/mqdefault.jpg' });
  assert.equal(feed.thumbnailFor(v, false), 'https://i.ytimg.com/vi/x/mqdefault.jpg');
  assert.equal(feed.thumbnailFor(v, true), v.image_url);
  assert.equal(feed.thumbnailFor(video(), false), video().image_url);
});

test('the Watch page refetches on focus and the card plays in-app, not in a browser', () => {
  const screen = read('src/screens/WatchScreen.tsx');
  assert.match(screen, /useFocusEffect\(/);
  assert.match(screen, /RefreshControl/);
  assert.match(screen, /sortNewestFirst\(/);
  const card = read('src/components/SocialPost.tsx');
  assert.match(card, /<YouTubePlayerModal /);
  assert.match(card, /isNewVideo\(/);
  // Recycled cells must not carry another video's watched state.
  assert.doesNotMatch(card, /useState<boolean>\(socialPost\.has_watched\)/);
  const player = read('src/components/watch/YouTubePlayerModal.tsx');
  assert.match(player, /onShouldStartLoadWithRequest=\{req => allowPlayerNavigation\(/);
  assert.match(player, /javaScriptCanOpenWindowsAutomatically=\{false\}/);
});
