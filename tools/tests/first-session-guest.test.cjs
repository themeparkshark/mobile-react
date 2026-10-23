'use strict';
/**
 * First session (Oct 23 polish): a guest plays before signing in, "Not now" on
 * location keeps playing, and a signed-out LinePlay never hangs.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { loadTs } = require('./helpers/ts-module.cjs');

const root = path.resolve(__dirname, '../..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

function guestTasteModule(store = new Map(), { broken = false } = {}) {
  const AsyncStorage = {
    async getItem(key) { if (broken) throw new Error('disk'); return store.has(key) ? store.get(key) : null; },
    async setItem(key, value) { if (broken) throw new Error('disk'); store.set(key, value); },
  };
  return loadTs('src/services/guestTaste.ts', {
    '@react-native-async-storage/async-storage': { default: AsyncStorage, __esModule: true },
  });
}

test('guest taste: find, play, coin, then the sign-in ask, in that order', () => {
  const { guestStep, EMPTY_GUEST_TASTE } = guestTasteModule();
  assert.equal(guestStep(EMPTY_GUEST_TASTE), 'find');
  assert.equal(guestStep({ caught: true, won: false, shelved: false }), 'play');
  assert.equal(guestStep({ caught: true, won: true, shelved: false }), 'coin');
  assert.equal(guestStep({ caught: true, won: true, shelved: true }), 'save');
});

test('guest taste progress is saved on the phone and a damaged save starts over safely', async () => {
  const store = new Map();
  const mod = guestTasteModule(store);
  assert.equal(await mod.guestPlayedWarmup(), false);
  await mod.saveGuestTaste({ caught: true, won: true, shelved: false });
  assert.equal(await mod.guestPlayedWarmup(), true);
  assert.equal(mod.guestStep(await mod.readGuestTaste()), 'coin');
  // A win without a catch, or junk, never skips a step.
  store.set(mod.GUEST_TASTE_KEY, JSON.stringify({ won: true, shelved: true }));
  assert.equal(mod.guestStep(await mod.readGuestTaste()), 'find');
  store.set(mod.GUEST_TASTE_KEY, '{not json');
  assert.equal(mod.guestStep(await mod.readGuestTaste()), 'find');
  const broken = guestTasteModule(new Map(), { broken: true });
  assert.equal(await broken.guestPlayedWarmup(), false, 'an unreadable store never blocks play');
  await broken.saveGuestTaste({ caught: true, won: false, shelved: false });
});

test('a guest who already won the warm-up is greeted back and never replays it', () => {
  const { getStepsForSequence } = loadTs('src/components/Tutorial/steps.ts');
  const fresh = getStepsForSequence('onboarding');
  const back = getStepsForSequence('onboarding', { guestPlayed: true });
  assert.equal(back.length, 1);
  assert.match(back[0].title, /back/i);
  assert.equal(back[0].nextText, fresh[0].nextText, 'same Grab it! step, so the first home find still opens');
  for (const steps of [getStepsForSequence('onboarding', { inPark: true, guestPlayed: true }),
    getStepsForSequence('park_arrival', { guestPlayed: true })]) {
    assert.ok(steps.length > 0);
    assert.ok(steps.every(step => step.activity !== 'memory_warmup'), 'no second warm-up');
  }
  assert.equal(getStepsForSequence('onboarding', { inPark: true })[0].activity, 'memory_warmup', 'new players still get it');
});

test('guest and Not now copy is short, kid readable and has no em dashes', () => {
  const { GUEST_TASTE_COPY } = guestTasteModule();
  const lines = [];
  const walk = value => typeof value === 'string' ? lines.push(value) : Object.values(value).forEach(walk);
  walk(GUEST_TASTE_COPY);
  const notNow = read('src/screens/ExploreScreen/PermissionsNotGranted.tsx').match(/NOT_NOW_COPY = \{([\s\S]*?)\} as const/)[1];
  const arcade = read('src/components/HomeArcade.tsx').match(/HOME_ARCADE_COPY = \{([\s\S]*?)\} as const/)[1];
  for (const block of [notNow, arcade]) for (const [, text] of block.matchAll(/'([^']+)'/g)) lines.push(text);
  assert.ok(lines.length >= 15);
  for (const line of lines) {
    assert.doesNotMatch(line, /—/, line);
    assert.ok(line.split(/\s+/).length <= 14, `short enough for a 7-year-old: ${line}`);
  }
});

test('Not now on location opens play (home arcade and a park pick), not News', () => {
  const source = read('src/screens/ExploreScreen/PermissionsNotGranted.tsx');
  const notNow = source.slice(source.indexOf('>Not now<') - 400, source.indexOf('>Not now<'));
  assert.doesNotMatch(notNow, /navigate\('News'\)/, 'Not now no longer leaves the game');
  assert.match(notNow, /setPlaying\(true\)/);
  assert.match(source, /<HomeArcade /);
  assert.match(source, /navigate\('CoinShelf'\)/);
  assert.match(source, /Turn On Location/);
});

test('home arcade is practice only: no coins, no Parts, no location', () => {
  const source = read('src/components/HomeArcade.tsx');
  assert.match(source, /isPractice/);
  assert.doesNotMatch(source, /redeem|reward(?!Mode)/i);
});

test('the guest sign-in ask is a game dialog with a Not now that keeps playing', () => {
  const source = read('src/hooks/usePermissions.tsx');
  assert.doesNotMatch(source, /Alert\.alert/);
  assert.match(source, /text: 'Not now', style: 'cancel'/);
  assert.match(source, /text: 'Sign in'/);
});

test('a signed-out LinePlay starts a local session instead of waiting forever', () => {
  const source = read('src/screens/LinePlay/LinePlayScreen.tsx');
  assert.doesNotMatch(source, /if \(!ride \|\| !playerId\) return;/);
  assert.match(source, /guest: playerId == null/);
});

test('the login guest door is a real Play now button, not small grey text', () => {
  const source = read('src/screens/Auth/LoginScreen.tsx');
  assert.match(source, /GUEST_PLAY_LABEL = 'Play now'/);
  assert.match(source, /<GameButton label=\{GUEST_PLAY_LABEL\}/);
  assert.match(source, /navigation\.navigate\('Explore'\)/);
});

// Round 2 (Oct 23): the taste belongs to one account, the copy promises only what is kept,
// guests hear the game, and the doors read in the right order.

test('the guest taste is claimed by the first account only: a sibling or a later account starts fresh', async () => {
  const store = new Map();
  const mod = guestTasteModule(store);
  assert.equal(await mod.claimGuestWarmup(20), false, 'nothing played yet');
  await mod.saveGuestTaste({ caught: true, won: true, shelved: true });
  assert.equal(await mod.claimGuestWarmup(null), false, 'a guest never claims');
  assert.equal(await mod.claimGuestWarmup(20), true, 'the first account after the taste keeps it');
  assert.equal(await mod.claimGuestWarmup(20), true, 'and keeps it on every later sign-in');
  assert.equal(await mod.claimGuestWarmup(31), false, 'a sibling account on the same phone does not');
  // The next guest after a sign-out plays a fresh taste; the first owner still keeps theirs.
  assert.equal(mod.guestStep(await mod.readGuestTaste()), 'find');
  assert.equal(await mod.guestPlayedWarmup(), false);
  await mod.saveGuestTaste({ caught: true, won: true, shelved: false });
  // Whoever signs in first after a taste claims it, even an earlier owner, so it never drifts to a sibling later.
  assert.equal(await mod.claimGuestWarmup(20), true);
  assert.equal(JSON.parse(store.get(mod.GUEST_TASTE_KEY)).claimedBy, 20);
  assert.equal(await mod.claimGuestWarmup(44), false, 'a later account on the phone starts fresh');
  await mod.saveGuestTaste({ caught: true, won: true, shelved: true });
  assert.equal(await mod.claimGuestWarmup(44), true, 'the next guest’s own account claims the next taste');
  assert.equal(await mod.claimGuestWarmup(31), false);
  const { guestClaimFor } = mod;
  assert.deepEqual({ ...guestClaimFor({ caught: true, won: false, shelved: false }, [], 5) }, { played: false, claim: false });
  assert.deepEqual({ ...guestClaimFor({ caught: true, won: true, shelved: false, claimedBy: 9 }, [], 5) }, { played: false, claim: false });
  const broken = guestTasteModule(new Map(), { broken: true });
  assert.equal(await broken.claimGuestWarmup(5), false, 'an unreadable store never blocks onboarding');
});

test('onboarding waits for the guest check, so a new account never starts the wrong steps', () => {
  const source = read('src/components/Tutorial/TutorialProvider.tsx');
  assert.match(source, /claimGuestWarmup\(playerId\)/);
  assert.match(source, /\(sequence === 'onboarding' \|\| sequence === 'park_arrival'\) && !guestChecked/);
  assert.doesNotMatch(source, /guestPlayedWarmup\(\)/);
});

test('the save ask promises only what is kept: no saved shark, no kept coin', () => {
  const { GUEST_TASTE_COPY } = guestTasteModule();
  const { getStepsForSequence } = loadTs('src/components/Tutorial/steps.ts');
  const backs = [true, false].map(findReady => getStepsForSequence('onboarding', { guestPlayed: true, findReady })[0]);
  const promises = [GUEST_TASTE_COPY.save.title, GUEST_TASTE_COPY.save.body, GUEST_TASTE_COPY.coin.title, GUEST_TASTE_COPY.coin.body,
    ...backs.flatMap(back => [back.title, back.text, back.subtitle])].filter(Boolean);
  for (const line of promises) assert.doesNotMatch(line, /saved|stays yours|your coin/i, line);
  assert.match(GUEST_TASTE_COPY.save.grownUp, /grown-up/);
  const card = read('src/screens/ExploreScreen/GuestTaste.tsx');
  assert.match(card, /COPY\.save\.grownUp/);
  assert.match(card, /<TreatBadge /, 'the churro has somewhere to go');
  assert.match(card, /COPY\.yum/, 'Finn reacts the instant the churro is caught');
  assert.match(card, /<ParkShelfArtwork /, 'the coin lands on the real park shelf art');
  assert.match(card, /setTimeout\(finish, reduced \? 2600 : 2000\)/, 'the shelf holds about 2 s (a tap goes on sooner)');
});

test('guests hear the game (silent switch still wins); players follow their setting; dev captures stay quiet', () => {
  const { sfxAllowed } = loadTs('src/context/sfxPolicy.ts');
  const base = { isReady: true, signedIn: false, playerSetting: null, quietCapture: false };
  assert.equal(sfxAllowed(base), true, 'a guest hears the first win');
  assert.equal(sfxAllowed({ ...base, quietCapture: true }), false);
  assert.equal(sfxAllowed({ ...base, signedIn: true, playerSetting: false }), false, 'a player who turned sounds off');
  assert.equal(sfxAllowed({ ...base, signedIn: true, playerSetting: undefined }), false);
  assert.equal(sfxAllowed({ ...base, signedIn: true, playerSetting: true }), true);
  assert.match(read('src/context/SoundEffectProvider.tsx'), /SFX\.setEnabled\(allowed\)/);
  assert.match(read('src/gamekit/audio/backends.ts'), /playsInSilentModeIOS: false/);
});

test('login: Play now is the big first door, Apple sign-in is for sharks who already have one, bubbles stop off screen', () => {
  const source = read('src/screens/Auth/LoginScreen.tsx');
  assert.ok(source.indexOf('top={') < source.indexOf('GUEST_PLAY_LABEL} icon="play"'), 'Play now sits above the Apple button');
  assert.doesNotMatch(source, /size="compact"/);
  assert.match(source, /caption=\{HAVE_SHARK_LABEL\}/);
  assert.match(source, /\{focused && BUBBLES\.map/);
  assert.match(source, /return \(\) => \{ alive = false; current\?\.stop\(\); \};/);
  const buttons = read('src/components/SignInButtons.tsx');
  assert.ok(buttons.indexOf('{top}') < buttons.indexOf('<AppleAuthentication.AppleAuthenticationButton'));
});

test('home words at home: Park Trivia says Home Arcade, and a guest line never says the wait is counting', () => {
  const selector = read('src/components/MiniGameSelector.tsx');
  assert.match(selector, /const homeArcade = taskName === HOME_ARCADE_TASK_NAME;/);
  assert.match(selector, /title=\{homeArcade \? 'Park Trivia' : 'Trivia Duel'\}/);
  assert.match(selector, /subtitle=\{homeArcade \? 'Home Arcade' : 'Queue Duel'\}/);
  assert.match(read('src/components/HomeArcade.tsx'), /taskName=\{HOME_ARCADE_TASK_NAME\}/);
  const sheet = read('src/screens/LinePlay/group/WhosInLineSheet.tsx');
  assert.match(sheet, /guest: 'Play while you wait\. Pick your crew\.'/);
  assert.match(sheet, /guest \? WHOS_IN_LINE_BODY\.guest : WHOS_IN_LINE_BODY\.player/);
});

test('one Finn and a clean underwater scene on the location cards', () => {
  const source = read('src/screens/ExploreScreen/PermissionsNotGranted.tsx');
  assert.doesNotMatch(source, /welcome\/shark\.png|water_background\.png/);
  assert.match(source, /tutorial\/teacher-shark\.png/);
  assert.match(source, /park: 'Ride coins'/);
  assert.match(source, /parkHint: 'Win these at the park'/);
});

// Round 3 (Oct 23): Finn never promises a treat that is not there, the first win is a real
// celebration, the first minute needs no reading, and the footer always shows.

test('welcome back (and a new player hello) only says "it landed right next to you" when a find is really there', () => {
  const { getStepsForSequence, GUEST_WELCOME_BACK } = loadTs('src/components/Tutorial/steps.ts');
  const ready = getStepsForSequence('onboarding', { guestPlayed: true, findReady: true })[0];
  const waiting = getStepsForSequence('onboarding', { guestPlayed: true, findReady: false })[0];
  assert.equal(ready.title, GUEST_WELCOME_BACK.title);
  assert.match(ready.text, /right next to you/);
  assert.equal(ready.nextText, 'Grab it!');
  assert.doesNotMatch(`${waiting.text} ${waiting.subtitle}`, /landed|right next to you|here/i);
  assert.match(waiting.subtitle, /Walk around/);
  assert.notEqual(waiting.nextText, 'Grab it!');
  const newPlayer = getStepsForSequence('onboarding', { findReady: false })[0];
  assert.doesNotMatch(`${newPlayer.text} ${newPlayer.subtitle}`, /landed|right next to you/i);
  // Never a park step at home: home onboarding has no park lines.
  for (const step of [ready, waiting, newPlayer]) assert.doesNotMatch(`${step.title ?? ''} ${step.text}`, /ride coin|collection/i);
});

test('the map waits to know where the player is, holds the first find for Finn, and opens it on Grab it!', () => {
  const source = read('src/screens/ExploreScreen.tsx');
  // Home or park must be known for the real hello; weak GPS gets the honest fallback (round 4).
  assert.match(source, /if \(!parkLoaded \|\| \(!park && !homeLocationConfirmed\)\) \{/, 'no real hello until home or park is known');
  assert.match(source, /startTutorial\('onboarding', \{ inPark: !!park, findReady: !park && homeFindReady, looking: !park && !homeFindReady \}\)/);
  assert.match(source, /source === 'auto' && isReady && !hasCompleted\('onboarding'\)/, 'the first find waits for Finn');
  assert.match(source, /onFindInRange=\{onFindInRange\}/, 'a loaded find in range counts at once');
  assert.match(source, /findLanded\?\.\(\)/, 'a find that lands late upgrades his line');
  // The pending find is cleared inside the timer (clearing it first cancelled the timer and the find never opened).
  const open = source.slice(source.indexOf('When Finn is done talking'), source.indexOf('Home Hunt v3'));
  assert.ok(open.indexOf('setTimeout(') < open.indexOf('setPendingFind(null);\n      handlePrepItemNearby'), open);
  assert.match(source, /tutorialActive: isActive \|\| firstLineGap/, 'the chest waits for the Nice catch line');
  const provider = read('src/components/Tutorial/TutorialProvider.tsx');
  assert.match(provider, /MAP_SEQUENCES\.has\(currentSequence as TutorialSequence\) \? 120 : 20/, 'Finn stands above the MAP compass');
});

test('Finn’s warm-up win is its own card: Finn cheering, a burst, what is next, one CONTINUE, fanfare', () => {
  const source = read('src/games/memory/MemoryResults.tsx');
  assert.match(source, /if \(firstWin\) return <FirstWinCard /);
  const card = source.slice(source.indexOf('function FirstWinCard'), source.indexOf('/** Fades a section in'));
  assert.ok(source.includes("FINN_GRAD = require('../../../assets/images/tutorial/teacher-shark.png')"), 'the same graduate Finn as the rest of the first minute');
  assert.ok(card.includes('source={FINN_GRAD}'));
  assert.match(card, /<SparkleBurst /);
  assert.match(card, /playLadder\('mm_sharp_twinkle'/, 'the twinkle ladder, not a lone hit');
  assert.match(card, /FIRST_WIN_COPY\.next/);
  assert.match(card, /colors=\{\['#0a5a9e', '#04305f'\]\}/, 'an opaque scrim: no empty board or booth shark behind');
  assert.match(read('src/games/memory/MemoryGame.tsx'), /mode === 'warmup' \? 'Finn’s Warm-up'/);
});

test('no animated SVG node in the memory HUD (a burst of SVG layout events crashed the warm-up once)', () => {
  const hud = read('src/games/memory/Hud.tsx');
  assert.doesNotMatch(hud, /createAnimatedComponent\(Circle\)|useAnimatedProps/);
  assert.match(hud, /styles\.quickRing/);
});

test('zero-reading cues and one story: a tapping hand, four dots on every step, the coin step says what happened', () => {
  const taste = read('src/screens/ExploreScreen/GuestTaste.tsx');
  assert.match(taste, /<TapHint delay=\{2000\} style=\{styles\.churroHand\} \/>/);
  assert.match(taste, /pointAtNext=\{step === 'play'\}/);
  assert.match(taste, /stepIndex=\{STEP_INDEX\.coin\} totalSteps=\{4\}/);
  assert.match(taste, /<ProgressDots index=\{STEP_INDEX\.save\} total=\{4\} \/>/);
  assert.match(taste, /const liveMap = step === 'find';/, 'the live map is not blurred behind an idle save card');
  const { GUEST_TASTE_COPY } = guestTasteModule();
  assert.equal(GUEST_TASTE_COPY.coin.title, 'You won!');
  assert.equal(GUEST_TASTE_COPY.yum.title, 'Yum!');
  // The grown-up cue is a label, not a look-alike button.
  const grown = taste.slice(taste.indexOf('grownUp: {'), taste.indexOf('grownUpText'));
  assert.doesNotMatch(grown, /backgroundColor|borderWidth/);
  assert.match(read('src/components/Tutorial/TeacherShark.tsx'), /showNext && pointAtNext && <TapHint/);
});

test('the location cards end above the footer, and the guest sign-in ask never promises coins', () => {
  const source = read('src/screens/ExploreScreen/PermissionsNotGranted.tsx');
  assert.match(source, /bottom: BOTTOM_BAR_OVERHANG/);
  const perms = read('src/hooks/usePermissions.tsx');
  assert.doesNotMatch(perms, /coins safe/);
  assert.match(perms, /Sign in to make your own shark\./);
});

// Round 4 (Oct 23): the first win is the biggest beat, one idea per bubble, Finn in a second
// (sniffing, then honest), a fallback for weak GPS, Finn is the only voice in minute one,
// the finger lands on the find, the full-bleed location scene, a pre-rolled name.

test('the first win is a staged celebration: squash pop, ribbon unfurl, one-shot shower, coin flies off to the shelf, pulse and hand', () => {
  const source = read('src/games/memory/MemoryResults.tsx');
  const card = source.slice(source.indexOf('function FirstWinCard'), source.indexOf('/** Fades a section in'));
  assert.match(source, /FIRST_WIN_BACKDROP = require\('..\/..\/..\/assets\/images\/screens\/park\/background-new.png'\)/, 'the underwater scene, not an empty gradient');
  assert.match(card, /source=\{FIRST_WIN_BACKDROP\}/);
  assert.match(card, /squash\.value = withDelay/, 'Finn pops with a squash and stretch');
  assert.match(card, /scaleX: pop\.value \* \(1 - squash\.value/);
  assert.match(card, /ribbon\.value = withDelay\(B\.ribbon/, 'the ribbon unfurls');
  assert.match(card, /<ShowerBit /, 'a shower falls from the top');
  assert.match(card, /shower\.value = withDelay\(B\.shower, withTiming\(1/, 'the shower plays once (no repeat)');
  assert.doesNotMatch(card, /withRepeat/, 'nothing loops forever on a card a kid may leave open');
  assert.match(card, /fly\.value = withTiming\(1/, 'the coin lifts off the card');
  assert.match(card, /setTimeout\(claim, FIRST_WIN_BEATS\.coinFly\)/, 'the coin step follows the coin');
  assert.match(card, /if \(reducedMotion\) \{ claim\(\); return; \}/, 'reduced motion goes on at once');
  assert.match(card, /<TapHint delay=\{0\} style=\{styles\.firstWinHand\} \/>/, 'a tapping hand on CONTINUE after 3 s');
  const { FIRST_WIN_BEATS } = { FIRST_WIN_BEATS: { pulse: 1500, hand: 3000 } };
  assert.match(source, new RegExp(`pulse: ${FIRST_WIN_BEATS.pulse}, hand: ${FIRST_WIN_BEATS.hand}`));
  assert.ok(card.includes('accessibilityRole="header"'), 'the header stays accessible');
});

test('after the first home catch Finn says one idea with a walking picture (no three currencies)', () => {
  const { getStepsForSequence, HOME_FIRST_FIND_COPY } = loadTs('src/components/Tutorial/steps.ts');
  const [step] = getStepsForSequence('home_first_find');
  assert.equal(step.title, HOME_FIRST_FIND_COPY.title);
  assert.equal(step.text, 'Walk around to find more!');
  assert.equal(step.picture, 'walk');
  assert.equal(step.subtitle, undefined);
  assert.doesNotMatch(`${step.title} ${step.text}`, /Energy|Ticket|boss|power/i);
  const teacher = read('src/components/Tutorial/TeacherShark.tsx');
  assert.match(teacher, /WALK_FEET = require\('..\/..\/..\/assets\/images\/trail\/steps.png'\)/, 'existing blue feet art');
  assert.match(read('src/components/Tutorial/TutorialProvider.tsx'), /picture=\{currentStep\.picture\}/);
});

test('at home Finn says hi in about a second, sniffing, then switches on his own (find or walk around)', () => {
  const { getStepsForSequence, HOME_LOOKING, HOME_LOOKING_MS } = loadTs('src/components/Tutorial/steps.ts');
  const looking = getStepsForSequence('onboarding', { findReady: false, looking: true })[0];
  assert.equal(looking.text, HOME_LOOKING.text);
  assert.equal(looking.sharkMood, 'thinking');
  assert.equal(looking.waitsForFind, true);
  assert.doesNotMatch(looking.text, /landed|right next to you/i, 'no promise while sniffing');
  const guest = getStepsForSequence('onboarding', { findReady: false, looking: true, guestPlayed: true })[0];
  assert.equal(guest.title, 'You’re back!');
  assert.ok(HOME_LOOKING_MS >= 3000 && HOME_LOOKING_MS <= 4000);
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const wait = park \? 1500 : homeFindReady \? 600 : 1000;/, 'no 4.5 s of silent map');
  const provider = read('src/components/Tutorial/TutorialProvider.tsx');
  assert.match(provider, /lookingStep = isActive && !!currentSteps\[currentIndex\]\?\.waitsForFind/);
  assert.match(provider, /getStepsForSequence\('onboarding', \{ findReady: false, guestPlayed \}\)/, 'after the sniff: the honest walk-around line');
  assert.match(provider, /onPress=\{currentStep\.activity \|\| currentStep\.waitsForFind \? undefined : nextStep\}/, 'a stray tap does not skip the sniff');
  assert.match(provider, /showNext=\{!currentStep\.interactive && !currentStep\.waitsForFind\}/);
  assert.match(read('src/components/Tutorial/TeacherShark.tsx'), /if \(mood === 'thinking'\) scanValue\.value = withDelay\(300, withRepeat\([\s\S]*?, 5, false/, 'a few sniffs, then still');
});

test('weak GPS: a player whose home never confirms still meets Finn after about 8 s, with the honest line', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /export const ONBOARDING_FALLBACK_MS = 8000;/);
  assert.match(explore, /setTimeout\(\(\) => startTutorial\('onboarding', \{ inPark: false, findReady: false \}\), ONBOARDING_FALLBACK_MS\)/);
  assert.match(explore, /if \(park\) return;\n      const fallback/, 'never the home hello while a park is still loading');
});

test('Finn is the only voice in minute one: event chips, park story, live parks bar and recap wait', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const finnOwnsMap = isActive \|\| firstLineGap \|\| !!pendingFind \|\| \(isReady && !hasCompleted\('onboarding'\)\);/);
  assert.match(explore, /parkStory=\{activeParkProject && !finnOwnsMap \?/);
  assert.match(explore, /eventChip=\{liveEvt\.event\?\.include_home && !finnOwnsMap \?/);
  assert.match(explore, /quiet=\{finnOwnsMap\}/);
  assert.match(explore, /visible=\{recapDue && mapFocused && !eventOpen && !finnOwnsMap\}/);
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /\{quiet \? null : <HomeLive /);
  assert.match(home, /useEffect\(\(\) => \{ if \(quiet\) setLiveBar\(null\); \}, \[quiet\]\);/, 'the controls move back up while the bar is away');
});

test('the map finger lands on the find, which breathes a soft ring', () => {
  const src = read('src/screens/ExploreScreen/PrepItem.tsx');
  assert.match(src, /const pointed = inRange && showFinger;/);
  assert.match(src, /\{pointed && <Animated\.View style=\{\[styles\.softRing, softRing\]\}/);
  // Fingertip = box centre + the turned half-height; it must land within 12 pt of the art centre.
  const B = 112, w = 34, h = 43;
  const tip = (left, top, deg) => { const r = deg * Math.PI / 180; return [left + w / 2 - (h / 2) * Math.sin(r), top + h / 2 + (h / 2) * Math.cos(r)]; };
  for (const [left, top, deg] of [[B / 2 - 1, B / 2 - 46, 28], [B / 2 - 33, B / 2 - 46, -28], [B / 2 - 34, B / 2 + 5, 210]]) {
    const [x, y] = tip(left, top, deg);
    assert.ok(Math.hypot(x - B / 2, y - B / 2) <= 12, `fingertip ${x.toFixed(1)},${y.toFixed(1)} is on the find`);
  }
  assert.match(src, /fingerRight: \{ left: B \/ 2 - 1 \}/);
  assert.match(src, /fingerLeft: \{ left: B \/ 2 - 33 \}/);
  assert.match(src, /fingerBelow: \{ top: B \/ 2 \+ 5, left: B \/ 2 - 34 \}/);
});

test('location cards: the scene runs full-bleed behind the footer, Finn stays under the status bar', () => {
  const src = read('src/screens/ExploreScreen/PermissionsNotGranted.tsx');
  assert.doesNotMatch(src, /borderBottomLeftRadius/, 'no rounded seam above the footer');
  assert.match(src, /<Backdrop \/>/);
  assert.match(src, /<FullBackdrop \/>/);
  assert.match(src, /height: h \+ BOTTOM_BAR_OVERHANG/, 'the raised layer draws the same full-height picture');
  assert.match(src, /paddingTop: top \+ 8 \+ \(compact \? FINN_OVERHANG_COMPACT : FINN_OVERHANG\)/, 'Finn clears the status bar');
  assert.match(src, /useSafeAreaInsets\(\)\.top/);
});

test('save card: the dots sit centred above the title and a returning family sees the same button brings their shark back', () => {
  const taste = read('src/screens/ExploreScreen/GuestTaste.tsx');
  const card = taste.slice(taste.indexOf('function SaveCard'), taste.indexOf('function ProgressDots'));
  assert.ok(card.indexOf('<ProgressDots') > card.indexOf('styles.finnWrap') && card.indexOf('<ProgressDots') < card.indexOf('styles.title'));
  assert.ok(card.indexOf('COPY.save.have') > card.indexOf('<SignInButtons'), 'under the Apple button');
  assert.doesNotMatch(taste, /dots: \{ position: 'absolute'/);
  const { GUEST_TASTE_COPY } = guestTasteModule();
  assert.match(GUEST_TASTE_COPY.save.have, /already have a shark/i);
  assert.doesNotMatch(GUEST_TASTE_COPY.save.have, /saved|stays yours|your coin/i);
});

test('the name step starts with a rolled kid-safe name, so a kid can just tap the button', () => {
  const src = read('src/screens/WelcomeScreen.tsx');
  assert.match(src, /useState\(rollName\)/);
  assert.doesNotMatch(src, /'Dole'/, 'no brand names in rolled names');
  assert.match(src, /selectTextOnFocus/, 'typing your own name replaces the rolled one');
});
