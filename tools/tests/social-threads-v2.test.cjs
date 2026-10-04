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
  for (const ok of ['I love it', 'So cool!', 'Got 3 stamps today!', 'Space Mountain at 7 pm', 'lol ig same', 'Rode 2 rides on Main Street']) {
    assert.equal(model.checkDraft(ok), null, ok);
  }
  assert.equal(model.checkDraft('   '), 'empty');
  assert.equal(model.checkDraft('x'.repeat(model.POST_MAX + 1)), 'too_long');
  for (const pii of ['text me at 714 555 0199', 'call me 555-0199', 'I live at 12 Elm Street', 'my email is kid@gmail.com', 'add me on snap', 'follow @sharkfan99']) {
    assert.equal(model.checkDraft(pii), 'personal_info', pii);
  }
  // Grooming has its own kid line (age, school, where you are, meeting up).
  for (const groom of ['meet @ the fountain', 'Sharks meetup at the fountain', 'meet me at the carousel', 'how old r u']) {
    assert.equal(model.checkDraft(groom), 'grooming', groom);
  }
  assert.match(model.DRAFT_LINES.grooming, /age, school, or where they are/);
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

test('report, block and delete never stack a game dialog on the closing menu sheet', () => {
  const menu = read('src/screens/threads/PostMenu.tsx');
  // A native dialog presented while the sheet was dismissing left an invisible layer that ate every tap.
  assert.doesNotMatch(menu, /confirmGame|Alert\.alert/);
  assert.match(menu, /setConfirm\('block'\)/);
  assert.match(menu, /onModalHide/);
});

test('the app classifies the panel probe set like the server: personal info and links before posting', () => {
  const cases = require('./fixtures/safetext_cases.json');
  const wrong = [];
  for (const [want, list] of Object.entries(cases)) {
    for (const text of list) {
      // self_harm and personal_question are server holds, never app blocks.
      const blocked = model.checkDraft(text, 100000);
      const got = want === 'self_harm' ? (model.isDistress(text) ? 'self_harm' : 'missed')
        : (blocked ?? (model.needsReview(text) ? 'personal_question' : 'ok'));
      // Mean words are the server's job; the composer only explains safety rules early.
      const expected = want === 'mean' ? (model.needsReview(text) ? 'personal_question' : 'ok') : want;
      if (got !== expected) wrong.push(`${text} => ${got} (want ${expected})`);
    }
  }
  assert.deepEqual(wrong, []);
});

test('quick replies are fixed kind phrases that pass the filter', () => {
  assert.ok(model.QUICK_REPLIES.length >= 4);
  for (const phrase of model.QUICK_REPLIES) assert.equal(model.checkDraft(phrase, model.REPLY_MAX), null, phrase);
  assert.match(read('src/screens/ThreadScreen.tsx'), /void send\(phrase\)/);
});

test('keyboard: inset comes from the keyboard height, so a header can never leave the input behind it', () => {
  const kb = loadTs('src/screens/threads/useKeyboardInset.ts', { react: {}, 'react-native': {} });
  assert.equal(kb.keyboardInset({ endCoordinates: { height: 336, screenY: 508, width: 390 } }, 844), 336);
  assert.equal(kb.keyboardInset({ endCoordinates: { height: 260, screenY: 200, width: 390 } }, 844), 0, 'floating keyboard covers nothing');
  for (const file of ['src/screens/ThreadScreen.tsx', 'src/screens/threads/Composer.tsx']) {
    const source = read(file);
    assert.doesNotMatch(source, /KeyboardAvoidingView/, file);
    assert.match(source, /paddingBottom: keyboard/, file);
  }
});

test('an empty POST answers: wiggle, nope sound, focus; and it is never disabled', () => {
  const composer = read('src/screens/threads/Composer.tsx');
  assert.match(composer, /dimmed=\{!canPost/);
  assert.doesNotMatch(composer, /disabled=\{!canPost/);
  assert.match(composer, /wiggle\.value = withSequence/);
  assert.doesNotMatch(composer, /\bsmall\b\s*\n\s*accessibilityLabel/);
});

test('first post waits for the rules promise; official posts show Theme Park Shark and cannot be blocked', () => {
  const social = read('src/screens/SocialScreen.tsx');
  assert.match(social, /hasPromised\(player\.id\)/);
  assert.match(social, /authorId: official \? null/);
  assert.match(read('src/screens/threads/ThreadCard.tsx'), /official \? <OfficialAvatar/);
  assert.match(read('src/Root.tsx'), /name="BlockedPlayers"/);
});

test('a reply to a reply notifies the kid who was answered', () => {
  const screen = read('src/screens/ThreadScreen.tsx');
  assert.match(screen, /const answered = replyTo && replyTo\.parent_id \? replyTo\.id : null/);
  assert.match(read('src/api/endpoints/social/index.ts'), /reply_to_id: replyToId/);
});

test('the safety rule table and probe set are byte-identical to the server copies (pinned hashes)', () => {
  const crypto = require('node:crypto');
  const hash = (file) => crypto.createHash('sha256').update(fs.readFileSync(path.join(root, file))).digest('hex');
  assert.equal(hash('src/screens/threads/safetextRules.json'), 'ebb6c8cdda3d3d2c7904a65b0491f3600e233e8dab1f39282c9e51bcd99e3cd7');
  assert.equal(hash('tools/tests/fixtures/safetext_cases.json'), '8995b287090390c50503363501a9e2f8384a93af0687658a22799aba9d87e640');
});

test('final round: weird-report reason, server rules promise, unblock confirm, prefetch, fresh post stays on top, light reply actions', () => {
  const menu = read('src/screens/threads/PostMenu.tsx');
  assert.match(menu, /reason: 'asked_about_me', label: 'Asked about me \/ made me feel weird'/);
  assert.match(read('src/screens/threads/RulesCard.tsx'), /acceptSocialRules\(\)/);
  assert.match(read('src/screens/threads/RulesCard.tsx'), /fetchSocialRules\(\)/);
  assert.match(read('src/screens/threads/BlockedPlayersScreen.tsx'), /confirmGame\(\{\s*title: 'Unblock\?'/);
  assert.match(read('src/context/ForumProvider.tsx'), /Image\.prefetch\(urls\)/);
  const social = read('src/screens/SocialScreen.tsx');
  assert.match(social, /Image\.prefetch\(urls\)/);
  assert.match(social, /fresh=\{item\.id === glowId\}/);
  assert.doesNotMatch(social, /setTimeout\(\(\) => setFreshId\(null\)/, 'the new post no longer drops under the pin after 4 s');
  const screen = read('src/screens/ThreadScreen.tsx');
  assert.match(screen, /onLongPress=\{\(\) => onMenu\(comment\)\}/);
  assert.match(screen, /hitSlop=\{14\}/);
  const composer = read('src/screens/threads/Composer.tsx');
  assert.match(composer, /const compactTopics = keyboard > 0/);
  assert.match(composer, /styles\.headerFade/);
});

test('R3: blocked drafts are reported by category only, once per text, and a pause shows its line', async () => {
  const sent = [];
  const send = async (code) => { sent.push(code); return { paused: sent.length >= 3, paused_until: null }; };
  const last = { current: null };
  assert.equal(await model.reportBlockedDraft('grooming', 'how old r u', last, send), null);
  assert.equal(await model.reportBlockedDraft('grooming', 'how old r u', last, send), null, 'same words, same tap: not counted again');
  await model.reportBlockedDraft('personal_info', 'whats ur snap', last, send);
  assert.match(await model.reportBlockedDraft('grooming', 'u alone rn?', last, send), /taking a break/);
  assert.equal(await model.reportBlockedDraft('mean', 'x', last, send), null);
  assert.deepEqual(plain(sent), ['grooming', 'personal_info', 'grooming']);
  assert.match(read('src/screens/threads/Composer.tsx'), /reportBlockedDraft\(problem, text, reportedDraft, reportFilterHit\)/);
  assert.match(read('src/screens/ThreadScreen.tsx'), /reportBlockedDraft\(problem, words, reportedDraft, reportFilterHit\)/);
});

test('R3: invisible characters, keycaps and foreign digits cannot hide anything; times and prices pass', () => {
  assert.equal(model.checkDraft('714\u200b555\u200b0199'), 'personal_info');
  assert.equal(model.checkDraft('7\ufe0f\u20e31\ufe0f\u20e34\ufe0f\u20e35\ufe0f\u20e35\ufe0f\u20e35\ufe0f\u20e30\ufe0f\u20e31\ufe0f\u20e39\ufe0f\u20e39\ufe0f\u20e3'), 'personal_info');
  assert.equal(model.checkDraft('\u0667\u0661\u0664\u0665\u0665\u0665\u0660\u0661\u0669\u0669'), 'personal_info');
  assert.equal(model.checkDraft('how o\u200cld are you'), 'grooming');
  for (const ok of ['The parade starts at 3:30 and 5:30 and 7:30', 'Wait times: 45, 30, 60, 90 min', '$12.99 for a churro', 'Character meetups are the best']) {
    assert.equal(model.checkDraft(ok), null, ok);
  }
});

test('R4: phone tricks, accents and grooming openers are caught; scores, waits and school trips pass', () => {
  for (const t of ['7145550199 in case u need it', '714\u2014555\u20140199', '714\u2022555\u20220199', '714,555,0199', '5 55 01 99 thats my line']) assert.equal(model.checkDraft(t), 'personal_info', t);
  for (const t of ['h\u00f3w \u00f3ld \u00e1r\u00e8 \u00fc', 'what age r u', 'wanna meet?', 'cuantos a\u00f1os tienes']) assert.equal(model.checkDraft(t), 'grooming', t);
  for (const t of ['New high score 4827193 on Toy Story Mania!!', 'Wait times today 20 35 50 15 10', 'My school is going to Disneyland for grad night']) assert.equal(model.checkDraft(t), null, t);
});

test('R4: location-now over-blocks are not reported toward the pause', async () => {
  const sent = [];
  const send = async (code) => { sent.push(code); return { paused: false, paused_until: null }; };
  assert.equal(model.checkDraft('im at the castle now'), 'grooming');
  await model.reportBlockedDraft('grooming', 'im at the castle now', { current: null }, send);
  assert.deepEqual(plain(sent), []);
  await model.reportBlockedDraft('grooming', 'what age r u', { current: null }, send);
  assert.deepEqual(plain(sent), ['grooming']);
});

test('R4: composer and reply bar ask for the pause before typing, debounce the hint, show the review line, neutral empty border', () => {
  const composer = read('src/screens/threads/Composer.tsx');
  assert.match(composer, /fetchPostingStatus\(\)/);
  assert.match(composer, /setTimeout\(\(\) => setHintText\(text\), HINT_DEBOUNCE_MS\)/);
  assert.match(composer, /setHeld\(thread\.review/);
  assert.doesNotMatch(composer, /problem === 'empty' && \{ borderColor: BRAND\.red \}/);
  const screen = read('src/screens/ThreadScreen.tsx');
  assert.match(screen, /fetchPostingStatus\(\)/);
  assert.match(screen, /HINT_DEBOUNCE_MS/);
  assert.match(read('src/screens/threads/ThreadCard.tsx'), /reviewLine\(thread\.review\)/);
  assert.equal(model.HINT_DEBOUNCE_MS, 250);
});

test('R5: self-harm words never block, they show a kind line and the held post says so', () => {
  for (const text of ['i want to die', 'nobody would miss me if i was gone', 'i cut myself']) {
    assert.equal(model.isDistress(text), true, text);
    assert.equal(model.checkDraft(text), null, `${text} is not blocked in the app`);
  }
  assert.equal(model.isDistress('that drop made me want to scream'), false);
  assert.match(model.CARE_LINE, /grown-up you trust/);
  assert.equal(model.reviewLine('care'), model.CARE_LINE);
  assert.equal(model.reviewLine('pending'), model.REVIEW_LINE);
  assert.equal(model.reviewLine(null), null);
  const composer = read('src/screens/threads/Composer.tsx');
  assert.match(composer, /care \? CARE_LINE : null/);
  assert.match(composer, /held === 'care' \? 'We hear you'/);
  assert.match(read('src/screens/ThreadScreen.tsx'), /reviewLine\(comment\.review\)/);
});

test('R5: you plus a personal topic is held by the server, never blocked by the app', () => {
  assert.equal(model.needsReview('what floor r u on'), true);
  assert.equal(model.checkDraft('what floor r u on'), null);
  for (const ok of ['See you on Main Street!', "Who's your favorite character to meet?", 'Can u send me good luck for the drop tower', 'Your pic of the castle is amazing']) {
    assert.equal(model.needsReview(ok), false, ok);
  }
});

test('R5: the keystroke path runs only the cheap check; the full filter is debounced and runs on send', () => {
  assert.equal(model.quickDraftProblem('   '), 'empty');
  assert.equal(model.quickDraftProblem('x'.repeat(model.POST_MAX + 1)), 'too_long');
  assert.equal(model.quickDraftProblem('call me 714 555 0199'), null);
  const composer = read('src/screens/threads/Composer.tsx');
  assert.doesNotMatch(composer, /useMemo\(\(\) => checkDraft\(text,/);
  assert.match(composer, /const quick = quickDraftProblem\(text, POST_MAX\)/);
  assert.match(composer, /const problem = checkDraft\(text, POST_MAX\)/);
  const screen = read('src/screens/ThreadScreen.tsx');
  assert.doesNotMatch(screen, /useMemo\(\(\) => checkDraft\(text,/);
  assert.match(screen, /const problem = checkDraft\(words, REPLY_MAX\)/);
  const long = 'Rode Tron and it was so fun, the wait was long but worth it. '.repeat(8).slice(0, 500);
  const t = process.hrtime.bigint();
  for (let i = 0; i < 100; i++) model.quickDraftProblem(long);
  assert.ok(Number(process.hrtime.bigint() - t) / 1e6 / 100 < 1, 'cheap check under 1 ms');
});

test('R5: on a posting break the reply send is dimmed and disabled and both text boxes are read-only', () => {
  const screen = read('src/screens/ThreadScreen.tsx');
  assert.match(screen, /const sendOff = Boolean\(pausedLine\) \|\| sending/);
  assert.match(screen, /accessibilityState=\{\{ disabled: sendOff/);
  assert.match(screen, /editable=\{!pausedLine\}/);
  assert.match(read('src/screens/threads/Composer.tsx'), /editable=\{!pausedLine\}/);
});

test('R5: phone tricks from the panel are caught', () => {
  for (const text of ['its $714 $555 $0199 total lol', 'my numbers like 7:14 5:55 01 99', 'seven fourteen, five fifty five, oh one ninety nine', 'sevenonefour fivefivefive zeroonenineninine', '7a1b4c5d5e5f0g1h9i9 decode it']) {
    assert.equal(model.checkDraft(text), 'personal_info', text);
  }
  for (const ok of ['Mickey pretzel was $8.49 and so worth it', 'the castle show starts at 8:30 and again at 9:45', 'seventy five minutes for Peter Pan!']) {
    assert.equal(model.checkDraft(ok), null, ok);
  }
});

test('R6: 988 in the care line, person-only holds say a grown-up will check, send state matches its accessibility state', () => {
  assert.match(model.CARE_LINE, /call or text 988/);
  assert.equal(model.reviewLine('person'), model.PERSON_LINE);
  assert.doesNotMatch(model.PERSON_LINE, /quick look/i);
  for (const text of ['i want to kms', 'i dont wanna be alive anymore', 'life isnt worth it']) assert.equal(model.isDistress(text), true, text);
  for (const text of ['ill be waiting by the castle, come alone', 'dont show this to ur mom', 'can i see a picture of you', 'where do u stay at']) {
    assert.equal(model.needsReview(text), true, text);
  }
  for (const ok of ['Which hotel pool do you like best?', "I go to the park after school sometimes, it's so close", "What age can you ride Rock n Roller Coaster? I'm 48 inches"]) {
    assert.equal(model.checkDraft(ok), null, ok);
    assert.equal(model.needsReview(ok), false, ok);
  }
  assert.match(read('src/screens/ThreadScreen.tsx'), /accessibilityState=\{\{ disabled: sendOff \}\}/);
  assert.match(read('src/screens/threads/Composer.tsx'), /held === 'person' \? 'Grown-up check'/);
});
