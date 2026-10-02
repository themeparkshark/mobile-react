const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const screen = fs.readFileSync(path.join(__dirname, '../../src/screens/NewsScreen.tsx'), 'utf8');

test('News reads the server-cached feed first, WordPress only as a fallback', () => {
  const fetch = screen.slice(screen.indexOf('const fetchEntries'), screen.indexOf('useAsyncEffect', screen.indexOf('const fetchEntries')));
  assert.ok(fetch.indexOf('getNews()') < fetch.indexOf('themeparkshark.com/wp-json'));
});

test('the WordPress fallback skips the full _embed payload (1 MB down to ~220 KB)', () => {
  assert.doesNotMatch(screen, /posts\?_embed&per_page/);
  assert.match(screen, /_embed: 'wp:featuredmedia'/);
  assert.match(screen, /_fields: 'id,date_gmt,title,link,excerpt,content,_links,_embedded'/);
});
