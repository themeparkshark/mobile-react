/**
 * News v2 (Dustin's Oct 8 feedback): feed model, layout rows, HTML prep and
 * the source rules that keep the reader kid safe and the server contract
 * backward compatible.
 */
const assert = require('node:assert/strict');
const test = require('node:test');
const { loadTs, read } = require('./helpers/load-ts.cjs');

const model = loadTs('src/screens/NewsScreen/newsModel.ts');
const rows = loadTs('src/screens/NewsScreen/feedRows.ts', { './newsModel': model });

const NOW = Date.parse('2026-10-09T02:30:00Z');
const entry = (id, date, extra = {}) => ({ id, date, title: `Story ${id}`, url: `https://themeparkshark.com/2026/10/08/story-${id}/`, featured_image: `https://themeparkshark.com/wp-content/uploads/a-${id}-768x432.jpg`, ...extra });

test('WordPress date_gmt has no zone and is read as UTC, never phone time', () => {
  assert.equal(model.newsTime('2026-10-09T01:05:27'), Date.parse('2026-10-09T01:05:27Z'));
  assert.equal(model.newsTime('2026-10-09T01:05:27Z'), Date.parse('2026-10-09T01:05:27Z'));
  assert.equal(model.newsTime('2026-10-09T01:05:27-07:00'), Date.parse('2026-10-09T08:05:27Z'));
  assert.ok(Number.isNaN(model.newsTime(null)));
});

test('ages read plainly and a story is never "just now" for hours', () => {
  assert.equal(model.timeAgo('2026-10-09T02:28:00', NOW), 'Just now');
  assert.equal(model.timeAgo('2026-10-09T02:00:00', NOW), '30 min ago');
  assert.equal(model.timeAgo('2026-10-08T19:19:35', NOW), '7 hr ago');
  assert.equal(model.timeAgo('2026-10-07T20:00:00', NOW), 'Yesterday');
  assert.equal(model.timeAgo('2026-10-02T15:00:00', NOW), 'Oct 2');
  assert.equal(model.timeAgo('2025-12-30T15:00:00', NOW), 'Dec 30, 2025');
  // A future date (clock skew) is not shown as negative.
  assert.equal(model.timeAgo('2026-10-09T03:30:00', NOW), 'Just now');
  assert.equal(model.isFresh('2026-10-09T01:00:00', NOW), true);
  assert.equal(model.isFresh('2026-10-08T10:00:00', NOW), false);
  assert.equal(model.isFresh('2026-10-10T10:00:00', NOW), false);
});

test('park tags come from WordPress categories, most specific first', () => {
  assert.equal(model.parkLabel(entry(1, '', { categories: [39, 40, 42] })), 'EPCOT');
  assert.equal(model.parkLabel(entry(2, '', { categories: [47, 57] })), 'Universal Hollywood');
  assert.equal(model.parkLabel(entry(3, '', { categories: [47, 56, 78, 71] })), 'Horror Nights');
  assert.equal(model.parkLabel(entry(4, '', { categories: [59] })), 'SeaWorld');
  assert.equal(model.parkLabel(entry(5, '', { categories: [1] })), null);
  assert.equal(model.filterOf(entry(6, '', { categories: [39, 52] })), 'disney');
  assert.equal(model.filterOf(entry(7, '', { categories: [61, 64] })), 'more');
});

test('without categories (live v1 server) title words still place stories', () => {
  assert.equal(model.filterOf({ ...entry(1, ''), title: 'Universal Studios Hollywood Holidays 2026 Add Merry Minions' }), 'universal');
  assert.equal(model.filterOf({ ...entry(2, ''), title: 'Disney&#8217;s Lakeshore Lodge Reveals Branch &#038; Brush Lounge' }), 'disney');
  assert.equal(model.filterOf({ ...entry(3, ''), title: 'Holiday World Happy Halloween Weekends Tops Midwest Ranking' }), 'more');
  assert.equal(model.filterOf({ ...entry(4, ''), title: 'Abbott Elementary Returns for Season 6' }), 'screen');
  assert.equal(model.filterOf({ ...entry(9, ''), title: 'Disney Halloween Home Decor 2026' }), 'disney');
  assert.equal(model.parkLabel({ ...entry(5, ''), title: 'SeaWorld Orlando adds a coaster' }), 'SeaWorld');
});

test('shows, films, streaming and games stay out of the park feed (Movies & TV)', () => {
  const screen = ['Abbott Elementary Returns for Season 6 on October 7', 'Disney+ Adds Super Bowl LXI Streaming on February 14, 2027',
    'Star Wars: Galactic Racer Launches on PS5, Xbox Series X|S and PC', 'Huluween on Disney+ Returns With Hocus Pocus, New Specials',
    'Avengers: Doomsday Footage Reveals Loki’s Return', 'Coven Academy Debuts October 1 on Freeform'];
  const park = ['Rock ‘n’ Roller Coaster Gets Muppets Holiday Overlay November 4', 'Savi’s Workshop Adds Lightsaber Effects and Updated Hilt',
    'Disney Believe Dining: Frozen Feast and Pluto’s Pita Platters', 'HHN 2026 Scare Zones Have Guest Triggers and Storm Effects'];
  for (const title of screen) {
    const e = { ...entry(1, ''), title, categories: [39] };
    assert.equal(model.isScreenStory(e), true, title);
    assert.equal(model.matchesFilter(e, 'all'), false, title);
    assert.equal(model.matchesFilter(e, 'screen'), true, title);
    assert.equal(model.parkLabel(e), 'Movies & TV');
  }
  for (const title of park) assert.equal(model.isScreenStory({ ...entry(2, ''), title, categories: [39] }), false, title);
  // A park-level category always wins (a film night at EPCOT is park news).
  assert.equal(model.isScreenStory({ ...entry(3, ''), title: 'Movie night returns', categories: [39, 42] }), false);
});

test('park chips match exact categories and fall back to the brand without them', () => {
  const wdw = entry(1, '', { categories: [39, 40, 41] });
  const dlr = entry(2, '', { categories: [39, 48, 49] });
  assert.equal(model.matchesFilter(wdw, 'disney', 'wdw'), true);
  assert.equal(model.matchesFilter(dlr, 'disney', 'wdw'), false);
  assert.equal(model.matchesFilter(dlr, 'universal'), false);
  assert.equal(model.matchesFilter(dlr, 'all'), true);
  const bare = { ...entry(3, ''), title: 'Magic Kingdom adds a parade' };
  assert.equal(model.matchesFilter(bare, 'disney', 'wdw'), true);
  // Every park chip's ids belong to its brand filter.
  for (const filter of model.NEWS_FILTERS) {
    for (const park of filter.parks) for (const id of park.ids) assert.ok(filter.ids.includes(id), `${park.key} ${id}`);
  }
});

test('card deks use the first real paragraph, never a photo credit', () => {
  const e = { content: '<figure><figcaption>Photo: Disney</figcaption></figure><p>Image courtesy of Sesame Place San Diego</p><p>The Count returns to Sesame Place San Diego with a new Halloween show this fall.</p>' };
  assert.equal(model.dek(e), 'The Count returns to Sesame Place San Diego with a new Halloween show this fall.');
  assert.equal(model.dek({ excerpt: '<p>Short excerpt that is the dek [&hellip;]</p>' }), 'Short excerpt that is the dek');
});

test('featured image shape: sent sizes, then the WordPress file name, clamped', () => {
  assert.equal(model.imageAspect({ image_width: 1080, image_height: 1350 }), 0.8);
  assert.equal(model.imageAspect({ featured_image: 'https://x/y-768x592.jpg' }), 768 / 592);
  assert.equal(model.imageAspect({ featured_image: 'https://x/y-768x513.webp' }), 768 / 513);
  assert.equal(model.imageAspect({ featured_image: 'https://x/y.jpg' }), 16 / 9);
  assert.equal(model.imageAspect({ image_width: 3000, image_height: 500 }), 2.4);
});

test('article HTML: scripts, comments and X embeds go; YouTube becomes a play card', () => {
  const html = [
    '<p>Hello</p><!-- tps-image-audit: x -->',
    '<figure class="wp-block-embed is-provider-twitter"><div class="wp-block-embed__wrapper"><blockquote class="twitter-tweet" data-dnt="true"><a href="https://twitter.com/x/status/1">View post on X</a></blockquote><script async src="https://platform.twitter.com/widgets.js"></script></div></figure>',
    '<h2>Watch the holiday rundown</h2>',
    '<figure class="wp-block-embed"><div class="wp-block-embed__wrapper"><iframe loading="lazy" title="Holidays &amp; more #Shorts" width="563" height="1000" src="https://www.youtube.com/embed/jY5Mqv7abcd?feature=oembed"></iframe></div></figure>',
    '<iframe src="https://example.com/map"></iframe><p>&nbsp;</p><p>End</p>',
  ].join('\n');
  const out = model.prepareArticleHtml(html);
  assert.doesNotMatch(out, /script|twitter|View post on X|<!--|example\.com|<iframe/);
  assert.match(out, /<tpsvideo data-id="jY5Mqv7abcd" data-title="Holidays &amp; more #Shorts" data-short="1"><\/tpsvideo>/);
  assert.match(out, /Watch the holiday rundown<\/h2>\s*<figure[^>]*><div[^>]*><tpsvideo/);
  assert.match(out, /<p>End<\/p>$/);
  assert.equal(model.youTubeId('https://www.youtube-nocookie.com/embed/I260jqM15EE?x=1'), 'I260jqM15EE');
});

test('Theme Park Shark article links open in the reader; pages and other sites do not', () => {
  assert.equal(model.tpsArticleSlug('https://themeparkshark.com/2026/08/06/universal-orlando-holidays-2026-dates-shows-and-tickets/'), 'universal-orlando-holidays-2026-dates-shows-and-tickets');
  assert.equal(model.tpsArticleSlug('https://www.themeparkshark.com/2026/08/06/x-y/#top'), 'x-y');
  assert.equal(model.tpsArticleSlug('https://themeparkshark.com/disneyland-wait-times/'), null);
  assert.equal(model.tpsArticleSlug('https://disneyparksblog.com/2026/08/06/x/'), null);
  assert.equal(model.isTpsUrl('https://themeparkshark.com/disneyland-wait-times/'), true);
  assert.equal(model.isTpsUrl('https://evil.com/?themeparkshark.com'), false);
});

test('merging keeps one copy per story, newest first, and never loses fields', () => {
  const a = entry(1, '2026-10-08T10:00:00', { categories: [39] });
  const b = entry(2, '2026-10-09T01:00:00');
  const a2 = { ...entry(1, '2026-10-08T10:00:00'), content: '<p>x</p>', categories: undefined };
  const merged = model.mergeEntries([a, b], [a2]);
  assert.deepEqual([...merged.map(e => e.id)], [2, 1]);
  assert.deepEqual([...merged[1].categories], [39]);
  assert.equal(merged[1].content, '<p>x</p>');
});

test('related stories prefer the same park family; local search needs every word', () => {
  const list = [
    entry(1, '', { categories: [39] }), entry(2, '', { categories: [47] }), entry(3, '', { categories: [39] }), entry(4, '', { categories: [47] }),
  ];
  assert.deepEqual([...model.relatedFor(list[0], list, 2).map(e => e.id)], [3, 2]);
  const s = [{ ...entry(1, ''), title: 'Merry Minions at Universal' }, { ...entry(2, ''), title: 'Minions Mayhem' }];
  assert.deepEqual([...model.searchLocal(s, 'merry minions').map(e => e.id)], [1]);
  assert.equal(model.searchLocal(s, 'x').length, 0);
});

test('WordPress posts and both server versions map to the same story shape', () => {
  const post = {
    id: 9, date_gmt: '2026-10-08T01:00:00', link: 'https://themeparkshark.com/2026/10/08/a/', title: { rendered: 'A &amp; B' },
    excerpt: { rendered: '<p>Dek</p>' }, content: { rendered: '<p>Body</p>' }, categories: [39, 40],
    _embedded: { 'wp:featuredmedia': [{ source_url: 'https://x/full.jpg', caption: { rendered: '<p>Photo: Disney</p>\n' },
      media_details: { width: 1920, height: 1080, sizes: { medium_large: { source_url: 'https://x/a-768x432.jpg', width: 768, height: 432 }, large: { source_url: 'https://x/a-1024x576.jpg', width: 1024, height: 576 } } } }] },
  };
  const e = model.entryFromWordPress(post);
  assert.equal(e.featured_image, 'https://x/a-768x432.jpg');
  assert.equal(e.featured_image_large, 'https://x/a-1024x576.jpg');
  assert.equal(e.featured_image_full, 'https://x/full.jpg');
  assert.equal(e.image_credit, 'Photo: Disney');
  assert.deepEqual([...e.categories], [39, 40]);
  assert.equal(model.entryFromWordPress({}), null);
  const v1 = model.entriesFromServer({ data: [entry(1, ''), { bad: true }] });
  assert.equal(v1.v2, false);
  assert.equal(v1.entries.length, 1);
  assert.equal(v1.hasMore, null);
  const v2 = model.entriesFromServer({ data: [entry(1, '')], meta: { version: 2, has_more: true } });
  assert.equal(v2.v2, true);
  assert.equal(v2.hasMore, true);
  assert.equal(model.entriesFromServer(null).entries.length, 0);
});

test('feed rows: lead story, day dividers, a photo story every few rows, then the site card', () => {
  const list = Array.from({ length: 12 }, (_, i) => entry(i + 1, new Date(NOW - i * 5 * 3600000).toISOString().slice(0, 19)));
  const out = rows.buildFeedRows({ entries: list, lead: true, now: NOW, searchLabel: null, loadingMore: false, failed: false, end: true, stale: false });
  assert.equal(out[0].type, 'hero');
  // NEW: at most three, park stories only, never on the lead (it already says TOP STORY).
  assert.ok(out.filter(r => r.fresh).length <= 3);
  assert.equal(out[0].fresh, false);
  assert.equal(out[1].type, 'sheet');
  assert.equal(out[2].type, 'day');
  assert.ok(out.some(r => r.type === 'feature'));
  assert.equal(out.at(-1).type, 'site');
  assert.equal(new Set(out.map(r => r.key)).size, out.length, 'unique keys');
  const search = rows.buildFeedRows({ entries: list.slice(0, 1), lead: false, now: NOW, searchLabel: 'minions', loadingMore: true, failed: false, end: false, stale: false });
  assert.deepEqual([...search.map(r => r.type)], ['sheet', 'search', 'row', 'skeleton', 'skeleton']);
  assert.equal(search[1].label, '1 story for "minions"');
  const failed = rows.buildFeedRows({ entries: list.slice(0, 2), lead: true, now: NOW, searchLabel: null, loadingMore: false, failed: true, end: false, stale: true });
  assert.deepEqual([...failed.map(r => r.type).slice(-2)], ['retry', 'site']);
  assert.ok(failed.some(r => r.type === 'stale'));
});

test('shopping stories never lead and sink to the end of their day', () => {
  const at = h => new Date(NOW - h * 3600000).toISOString().slice(0, 19);
  const list = [
    { ...entry(1, at(1)), title: 'Marvel Products to Check Out Ahead of Avengers Endgame: Encore' },
    { ...entry(2, at(2)), title: 'Disney and Macy\u2019s Holiday Collection celebrates the 100th Macy\u2019s Parade' },
    { ...entry(3, at(3)), title: 'Rock \u2018n\u2019 Roller Coaster Gets Muppets Holiday Overlay' },
    { ...entry(4, at(4)), title: 'Savi\u2019s Workshop Adds Lightsaber Effects' },
  ];
  assert.equal(model.isShopStory(list[0]), true);
  assert.equal(model.isShopStory(list[1]), true);
  assert.equal(model.isShopStory(list[2]), false);
  const led = model.withLead(list);
  assert.equal(led[0].id, 3);
  const spaced = [led[0], ...rows.shopLast(led.slice(1), NOW)];
  assert.deepEqual([...spaced.map(e => e.id)], [3, 4, 1, 2]);
  // Paging: rows already shown keep their place; a refresh with a new top story starts fresh.
  const grown = rows.keepOrder([3, 4, 1], [...led, { ...entry(9, at(30)), title: 'Older park story' }]);
  assert.deepEqual([...grown.map(e => e.id)], [3, 4, 1, 2, 9]);
  const refreshed = rows.keepOrder([3, 4, 1], [{ ...entry(10, at(0)), title: 'Brand new' }, ...led]);
  assert.equal(refreshed[0].id, 10);
});

test('cruise stories filed under Disney get a cruise tag; shop sorting keeps calendar days in order', () => {
  assert.equal(model.parkLabel({ ...entry(1, ''), title: 'Disney Believe Dining: Frozen Feast', categories: [39] }), 'Disney Cruise Line');
  assert.equal(model.parkLabel({ ...entry(2, ''), title: 'Disney Cruise Line brings three events to Alaska', categories: [39] }), 'Disney Cruise Line');
  assert.equal(model.parkLabel({ ...entry(3, ''), title: 'Disney Wish dining at EPCOT', categories: [39, 42] }), 'EPCOT');
  assert.equal(model.parkLabel({ ...entry(5, ''), title: 'Jungle Cruise adds holiday jokes', categories: [39] }), 'Disney');
  assert.equal(model.parkLabel({ ...entry(6, ''), title: 'Disney Adventure World opens in Paris', categories: [39] }), 'Disney');
  const day = d => `2026-09-${d}T12:00:00`;
  const list = [
    { ...entry(1, day(17)), title: 'Disney Store Holiday Toys We Love' },
    { ...entry(2, day(16)), title: 'Halloween Horror Nights adds a house' },
    { ...entry(3, day(3)), title: 'Disney World Adds New Churros' },
    { ...entry(4, day(3)), title: 'Marvel Products to Check Out' },
  ];
  const sorted = rows.shopLast(list, NOW).map(e => e.id);
  assert.deepEqual([...sorted], [1, 2, 3, 4]);
});

test('kid safety: every way out of the reader goes through services/external', () => {
  for (const file of ['src/screens/ArticleScreen.tsx', 'src/screens/NewsScreen.tsx', 'src/screens/NewsScreen/ArticleBody.tsx', 'src/screens/NewsScreen/ArticlePage.tsx', 'src/screens/NewsScreen/NewsCards.tsx']) {
    const src = read(file);
    assert.doesNotMatch(src, /Linking\.openURL|openBrowserAsync|Share\.share\(/, file);
  }
  const reader = read('src/screens/ArticleScreen.tsx');
  assert.match(reader, /openExternal\(href\)/);
  assert.match(reader, /shareExternal\(/);
  // In-article video uses the kid-safe Watch player with no coins.
  assert.match(reader, /<YouTubePlayerModal video=\{video\} watched coins=\{0\}/);
});

test('the reader clears the Dynamic Island and the server contract stays additive', () => {
  const reader = read('src/screens/ArticleScreen.tsx');
  // The house Topbar (it sits below the status bar and the Dynamic Island) with Alex's back button.
  assert.match(reader, /<Topbar>/);
  assert.match(reader, /<BackButton \/>/);
  // The left edge stays free for the iOS back swipe.
  assert.match(reader, /left edge belongs to the iOS back swipe/);
  const feed = read('src/screens/NewsScreen/newsFeed.ts');
  // Old and new servers both answer GET /news with { data: [...] }; v2 is detected, never assumed.
  assert.match(feed, /client\.get\('\/news'/);
  assert.match(feed, /if \(!v2 && !plain\) throw/);
});

test('News has a dev preview flag', () => {
  assert.match(read('src/devRoutes.tsx'), /EXPO_PUBLIC_NEWS_PREVIEW\), 'News'\]/);
});
