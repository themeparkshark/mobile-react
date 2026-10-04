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

test('the player page uses the IFrame API on youtube-nocookie with rel=0 and no way to inject markup', () => {
  const html = feed.playerHtml('Vdiom632yME');
  assert.match(html, /host:"https:\/\/www\.youtube-nocookie\.com"/);
  assert.match(html, /"rel":0/);
  assert.match(html, /"playsinline":1/);
  assert.match(html, /https:\/\/www\.youtube\.com\/iframe_api/);
  // Ready comes from the player, not the page load; a switched video is put back.
  assert.match(html, /onReady:function\(e\)\{readySent=true;post\(\{type:'ready'\}\)/);
  assert.match(html, /d\.video_id!==VID\)\{try\{player\.cueVideoById\(VID\)/);
  assert.throws(() => feed.playerHtml('"><script>alert(1)</script>'));
  assert.deepEqual(feed.parsePlayerMessage('{"type":"ready"}'), { type: 'ready' });
  assert.equal(feed.parsePlayerMessage('{"type":"navigate","url":"x"}'), null);
  assert.equal(feed.parsePlayerMessage('not json'), null);
});

test('the player never navigates its top frame away, and frames are only the YouTube embed', () => {
  assert.equal(feed.allowPlayerNavigation('https://themeparkshark.com/', true), true);
  assert.equal(feed.allowPlayerNavigation('about:blank', true), true);
  assert.equal(feed.allowPlayerNavigation('https://www.youtube.com/watch?v=Vdiom632yME', true), false);
  assert.equal(feed.allowPlayerNavigation('https://www.youtube-nocookie.com/embed/Vdiom632yME', true), false);
  assert.equal(feed.allowPlayerNavigation('https://m.youtube.com/', true), false);
  assert.equal(feed.allowPlayerNavigation('https://themeparkshark.com/some-article/', true), false);
  // Frames
  assert.equal(feed.allowPlayerNavigation('https://www.youtube-nocookie.com/embed/Vdiom632yME?rel=0', false), true);
  assert.equal(feed.allowPlayerNavigation('https://www.youtube.com/embed/Vdiom632yME', false), true);
  assert.equal(feed.allowPlayerNavigation('about:srcdoc', false), true);
  assert.equal(feed.allowPlayerNavigation('https://www.youtube.com/watch?v=x', false), false);
  assert.equal(feed.allowPlayerNavigation('https://googleads.g.doubleclick.net/pagead/ads', false), false);
  assert.equal(feed.allowPlayerNavigation('https://accounts.google.com/ServiceLogin', false), false);
  assert.equal(feed.allowPlayerNavigation('https://www.youtube-nocookie.com.evil.test/embed/x', false), false);
  assert.equal(feed.allowPlayerNavigation('http://www.youtube-nocookie.com/embed/x', false), false);
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
  assert.match(card, /<YouTubePlayerModal\b/);
  assert.match(card, /isNewVideo\(/);
  // Recycled cells must not carry another video's watched state.
  assert.doesNotMatch(card, /useState<boolean>\(socialPost\.has_watched\)/);
  const player = read('src/components/watch/YouTubePlayerModal.tsx');
  assert.match(player, /onShouldStartLoadWithRequest=\{req => allowPlayerNavigation\(/);
  assert.match(player, /javaScriptCanOpenWindowsAutomatically=\{false\}/);
});

test('coins need real playing time: 30s for a video, 10s for a Short, or finishing', () => {
  assert.equal(feed.earnedView(29_999, false, false), false);
  assert.equal(feed.earnedView(30_000, false, false), true);
  assert.equal(feed.earnedView(10_000, false, true), true);
  assert.equal(feed.earnedView(3_000, false, true), false);
  assert.equal(feed.earnedView(5_000, true, false), true);
  const card = read('src/components/SocialPost.tsx');
  assert.match(card, /earnedView\(result\.playedMs, result\.ended, socialPost\.is_short\)/);
});

test('the Watch reward shows once: the server coin banner is suppressed for the view call only', () => {
  const filter = loadTs('src/api/broadcastFilter.ts');
  const list = ['You earned 25 Shark Coins!', 'Level up! You reached level 4!'];
  assert.deepEqual([...filter.visibleBroadcasts(list, true)], ['Level up! You reached level 4!']);
  assert.deepEqual([...filter.visibleBroadcasts(list, false)], list);
  assert.match(read('src/api/endpoints/social-posts/view.ts'), /\[QUIET_COIN_BROADCAST\]: true/);
  assert.match(read('src/hooks/useAxiosSetup.ts'), /visibleBroadcasts<string>\(/);
});

test('the player keeps no cookies, limits origins and covers the end screen', () => {
  const player = read('src/components/watch/YouTubePlayerModal.tsx');
  assert.match(player, /originWhitelist=\{PLAYER_ORIGIN_WHITELIST\}/);
  assert.match(player, /incognito/);
  assert.match(player, /sharedCookiesEnabled=\{false\}/);
  assert.match(player, /That's a wrap!/);
  assert.match(player, /!ready && !failed/);
  // A narrower whitelist makes react-native-webview open the failing URL in Safari (Linking.openURL).
  assert.deepEqual([...feed.PLAYER_ORIGIN_WHITELIST], ['*']);
  assert.match(read('node_modules/react-native-webview/lib/WebViewShared.js'), /passesWhitelist\(compileWhitelist\(originWhitelist\),url\)\)\{_reactNative\.Linking\.canOpenURL/);
});

test('the Watch page sits on the clean background with a hero and per-video coin chips', () => {
  const screen = read('src/screens/WatchScreen.tsx');
  assert.match(screen, /<CleanScreenBackground underTopbar>/);
  assert.match(screen, /<SocialPost socialPost=\{featuredVideo\} featured \/>/);
  const card = read('src/components/SocialPost.tsx');
  assert.match(card, /styles\.coinChip/);
  assert.match(card, /styles\.watchedChip/);
});
