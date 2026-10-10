const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const feed = fs.readFileSync(path.join(__dirname, '../../src/screens/NewsScreen/newsFeed.ts'), 'utf8');

test('News reads the server-cached feed first, WordPress only as a fallback', () => {
  const fetch = feed.slice(feed.indexOf('export async function fetchNewsPage'));
  assert.ok(fetch.indexOf('fromServer(query)') < fetch.indexOf('fromWordPress(query)'));
  assert.match(feed, /if \(plain \|\| serverV2\)/);
});

test('the WordPress fallback skips the full _embed payload (1 MB down to ~220 KB) and is time-boxed', () => {
  assert.doesNotMatch(feed, /posts\?_embed&per_page/);
  assert.match(feed, /_embed: 'wp:featuredmedia'/);
  assert.match(feed, /const WP_FIELDS = 'id,date_gmt,title,link,excerpt,content,categories,_links,_embedded'/);
  assert.match(feed, /timeout: WP_TIMEOUT_MS/);
});
