// Threads v2 (Shark Social): composer rules, kid lines, reactions, paging,
// cross-screen events and reply rows. Audit: tps-prime-time-audit/next-wave/threads-v2/AUDIT.md
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { loadTs } = require('./helpers/ts-module.cjs');
const { plain } = require('./helpers/plain.cjs');

const root = path.resolve(__dirname, '../..');
const model = loadTs('src/screens/threads/socialModel.ts');
const events = loadTs('src/screens/threads/socialEvents.ts');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('short kid posts are fine; blank, too long, personal info and links get a kid line', () => {
  for (const ok of ['I love it', 'So cool!', 'Got 3 stamps today!', 'Space Mountain at 7 pm', 'meet @ the fountain', 'Rode 2 rides on Main Street']) {
    assert.equal(model.checkDraft(ok), null, ok);
  }
  assert.equal(model.checkDraft('   '), 'empty');
  assert.equal(model.checkDraft('x'.repeat(model.POST_MAX + 1)), 'too_long');
  for (const pii of ['text me at 714 555 0199', 'call me 555-0199', 'I live at 12 Elm Street', 'my email is kid@gmail.com', 'add me on snap', 'follow @sharkfan99', 'Sharks meetup at the fountain', 'meet me at the carousel']) {
    assert.equal(model.checkDraft(pii), 'personal_info', pii);
  }
  assert.equal(model.checkDraft('go to coolsite.com'), 'link');
  for (const line of Object.values(model.DRAFT_LINES)) assert.doesNotMatch(line, /—|field|characters/);
});

test('the title is the first line, like the server makes it', () => {
  assert.equal(model.titleFrom('Park day!\nSo fun'), 'Park day!');
  assert.equal(model.titleFrom('x'.repeat(200)).length, 140);
});

test('times are short and a server clock ahead of the phone reads "just now", never "in 36 minutes ago"', () => {
  const now = Date.parse('2026-10-02T20:00:00Z');
  assert.equal(model.timeAgo('2026-10-02T20:36:00Z', now), 'just now');
  assert.equal(model.timeAgo('2026-10-02T19:55:00Z', now), '5m');
  assert.equal(model.timeAgo('2026-10-02T17:00:00Z', now), '3h');
  assert.equal(model.timeAgo('2026-09-30T20:00:00Z', now), '2d');
  assert.equal(model.timeAgo('2026-08-01T20:00:00Z', now), 'Aug 1');
  assert.equal(model.timeAgoSpoken('2026-10-02T19:59:00Z', now), '1 minute ago');
  assert.equal(model.timeAgo(null, now), '');
});

test('a tap reacts, the same face takes it back, another face moves it', () => {
  let state = { counts: [{ reaction_type_id: 4, count: 2 }], mine: null, total: 2 };
  state = model.toggleReaction(state, 4);
  assert.deepEqual(plain(state), { counts: [{ reaction_type_id: 4, count: 3 }], mine: 4, total: 3 });
  state = model.toggleReaction(state, 2);
  assert.equal(model.countFor(state, 4), 2);
  assert.equal(model.countFor(state, 2), 1);
  assert.equal(state.mine, 2);
  assert.equal(state.total, 3);
  state = model.toggleReaction(state, 2);
  assert.equal(state.mine, null);
  assert.equal(model.countFor(state, 2), 0);
  assert.equal(state.total, 2);
});

test('the picker offers kind faces only; Mad and Sad stay readable but are not offered', () => {
  const types = ['Happy', 'Laugh', 'Love', 'Mad', 'Sad', 'Wow'].map((name, i) => ({ id: i + 2, name, image_url: '' }));
  assert.deepEqual(plain(model.pickerReactions(types).map((t) => t.name)), ['Love', 'Happy', 'Laugh', 'Wow']);
});

test('every failure becomes one kid line; raw Laravel text never shows', () => {
  assert.equal(model.errorLine({ message: 'Network Error' }), 'No signal right now. Your words are saved, try again.');
  assert.equal(model.errorLine({ response: { status: 422, data: { message: 'x', errors: { content: ["Stay safe! Don't share phone numbers, addresses, emails or other apps."] } } } }),
    "Stay safe! Don't share phone numbers, addresses, emails or other apps.");
  assert.equal(model.errorLine({ response: { status: 422, data: { message: 'The title field must be at least 10 characters. (and 1 more error)', errors: { title: ['The title field must be at least 10 characters.'] } } } }),
    'Something went wrong. Your words are saved, try again.');
  assert.equal(model.errorLine({ response: { status: 429, data: { errors: { content: ['Whoa, slow down! Try again in 40 seconds.'] } } } }), 'Whoa, slow down! Try again in 40 seconds.');
  assert.equal(model.errorLine({ response: { status: 403, data: { message: "You're taking a break from posting. Try again in 5 hours." } } }), "You're taking a break from posting. Try again in 5 hours.");
  assert.equal(model.errorLine({ response: { status: 500, data: { message: 'Server Error' } } }), 'Something went wrong. Your words are saved, try again.');
});

test('paging appends without duplicates and page 1 replaces', () => {
  assert.deepEqual(plain(model.mergePage([{ id: 1 }, { id: 2 }], [{ id: 2 }, { id: 3 }], 2)), [{ id: 1 }, { id: 2 }, { id: 3 }]);
  assert.deepEqual(plain(model.mergePage([{ id: 1 }], [{ id: 9 }], 1)), [{ id: 9 }]);
});

test('post screen changes reach the feed: delete, block, edit, reply count', () => {
  const feed = [{ id: 1, player: { id: 7 }, comments_count: 2, content: 'a' }, { id: 2, player: { id: 8 }, comments_count: 0, content: 'b' }];
  assert.deepEqual(events.applySocialEvent(feed, { type: 'thread-gone', id: 1 }).map((t) => t.id), [2]);
  assert.deepEqual(events.applySocialEvent(feed, { type: 'player-blocked', playerId: 8 }).map((t) => t.id), [1]);
  assert.equal(events.applySocialEvent(feed, { type: 'thread-updated', thread: { id: 2, content: 'edited' } })[1].content, 'edited');
  assert.equal(events.applySocialEvent(feed, { type: 'replies-changed', id: 1, delta: 1 })[0].comments_count, 3);
  assert.equal(events.applySocialEvent(feed, { type: 'replies-changed', id: 2, delta: -1 })[1].comments_count, 0);
});

test('one detail view: the feed opens ThreadScreen with its copy of the post; no old sheet or old components', () => {
  const social = read('src/screens/SocialScreen.tsx');
  assert.match(social, /navigation\.navigate\('Thread', \{ thread: thread\.id, preview: thread \}\)/);
  assert.doesNotMatch(social, /ThreadSheet|CreateThreadModal|ReactionsDropdown/);
  for (const gone of ['CreateThreadModal', 'CreateReply', 'ThreadActions', 'CreateReport', 'Comment', 'ReactionsDropdown']) {
    assert.equal(fs.existsSync(path.join(root, `src/components/${gone}.tsx`)), false, gone);
  }
});

test('the composer header cannot leave the screen and posting never loses words', () => {
  const composer = read('src/screens/threads/Composer.tsx');
  // The old sheet: fixed 78% height inside react-native-modal with avoidKeyboard.
  assert.doesNotMatch(composer, /avoidKeyboard|SCREEN_HEIGHT \* 0\.78/);
  assert.match(composer, /presentationStyle="fullScreen"/);
  assert.match(composer, /AsyncStorage\.setItem\(draftKey/);
  assert.match(composer, /setServerLine\(errorLine\(error\)\)/);
  assert.doesNotMatch(composer, /Alert\.alert/);
});

test('every Social surface respects Reduce Motion', () => {
  for (const file of ['src/screens/SocialScreen.tsx', 'src/screens/ThreadScreen.tsx', 'src/screens/threads/Composer.tsx', 'src/screens/threads/ThreadCard.tsx', 'src/screens/threads/socialLook.tsx', 'src/screens/threads/PostMenu.tsx']) {
    assert.match(read(file), /useUiReducedMotion/, file);
  }
});

test('reply rows: answers sit under their reply, hidden answers with no replies are dropped, "show more" counts the rest', () => {
  const screen = loadTs('src/screens/threads/socialRows.ts');
  const top = { id: 1, children_count: 4, children: [{ id: 2 }, { id: 3, hidden: 'removed', children_count: 0 }] };
  const rows = screen.buildRows([top, { id: 9, children_count: 0, children: [] }], { 1: [{ id: 4 }] });
  assert.deepEqual(plain(rows.map((r) => r.key)), ['c1', 'c2', 'c4', 'm1', 'c9']);
  assert.equal(rows.find((r) => r.kind === 'more').remaining, 1);
});
