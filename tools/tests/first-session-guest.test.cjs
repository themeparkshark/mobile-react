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
  assert.equal(ready.beside, true, 'Finn stands beside his bubble so the find at the middle of the map stays in view');
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
  assert.match(source, /const finnsFirstFind = isReady && !hasCompleted\('onboarding'\);/);
  assert.match(source, /if \(isActive \|\| \(source === 'auto' && finnsFirstFind\)\) \{\s*setPendingFind/, 'the first find waits for Finn');
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
  assert.ok(source.includes("FINN_CHEER = require('../../assets/games/memory/studio/barker_fist_pump.png')"), 'the same boater Finn the kid just played with, cheering (no costume swap)');
  assert.ok(card.includes('source={FINN_CHEER}'));
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
  assert.match(card, /fly\.value = withTiming\(1/, 'the coin hops on CONTINUE');
  assert.match(card, /setFirstWinCoinSpot\(/, 'the coin hands its screen spot to the shelf step');
  assert.match(card, /claimTimer\.current = setTimeout\(claim, FIRST_WIN_BEATS\.coinLift\)/, 'the coin step follows the coin');
  assert.match(card, /if \(reducedMotion\) \{ claim\(\); return; \}/, 'reduced motion goes on at once');
  assert.match(card, /<TapHint delay=\{0\} style=\{styles\.firstWinHand\} \/>/, 'a tapping hand on CONTINUE after 3 s');
  assert.match(source, /next: 200, button: 320, live: 650, pulse: 1100, hand: 3000/, 'rows settle by 0.3 s, CONTINUE live at 0.65 s');
  assert.doesNotMatch(card.slice(card.indexOf('const nextSt'), card.indexOf('const coinSt')), /opacity: (next|btn)\.value/, 'the rows are never invisible on the card');
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
  assert.ok(card.indexOf('<ProgressDots') > card.indexOf('styles.saveFinnWrap') && card.indexOf('<ProgressDots') < card.indexOf('styles.title'));
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

// Wave 2 round 1 (Oct 23): a guaranteed first-win end, no empty or skippable first frames,
// the same coin travels to the shelf, Finn stays clear of the find, Finn is the only voice.

test('the warm-up first win never waits: the card is built on the frame the run ends, and a watchdog guarantees it', () => {
  const source = read('src/games/memory/MemoryGame.tsx');
  const finish = source.slice(source.indexOf('const finishRun = useCallback'), source.indexOf('// Board clear (3 beats'));
  assert.match(finish, /if \(r\.mode === 'warmup'\) \{[\s\S]*?showEnd\(r, won\);[\s\S]*?return;/, 'warm-up result is synchronous');
  assert.match(source, /const armEndWatch = useCallback/, 'an end watchdog exists');
  assert.match(source, /endWatch\.current = setTimeout\(/, 'the watchdog is its own timer, not one of later()');
  assert.doesNotMatch(source.slice(source.indexOf('const clearTimers'), source.indexOf('const clearTimers') + 200), /endWatch/, 'clearTimers can never cancel the watchdog');
  assert.match(source, /armEndWatch\(r, true, r\.mode === 'warmup' \? 1800 : 7000\)/, 'armed the moment the board is clear');
  assert.match(source, /if \(reducedMotion\) \{\s*\/\/ Still: the CLEARED sign lands the instant/, 'reduced motion shows CLEARED at once');
});

test('first-win CONTINUE takes taps only once it is shown, and the ride picture says where coins come from', () => {
  const source = read('src/games/memory/MemoryResults.tsx');
  const card = source.slice(source.indexOf('function FirstWinCard'), source.indexOf('/** One piece of the one-shot shower'));
  assert.match(card, /pointerEvents=\{live \? 'auto' : 'none'\}/);
  assert.match(card, /disabled=\{!live\}/);
  assert.match(card, /if \(leaving\.current \|\| !live\) return;/);
  assert.match(card, /useEffect\(\(\) => \(\) => \{ if \(claimTimer\.current\) clearTimeout\(claimTimer\.current\); \}, \[\]\)/, 'the claim timer is cleared on unmount');
  assert.match(source, /FIRST_WIN_RIDE = require\('..\/..\/..\/assets\/icons\/game\/ride.png'\)/, 'existing ride art, no new art');
});

test('the shelf step flies the same coin from the first-win card spot', () => {
  const { setFirstWinCoinSpot, takeFirstWinCoinSpot } = loadTs('src/games/memory/firstWinHandoff.ts');
  assert.equal(takeFirstWinCoinSpot(), null);
  setFirstWinCoinSpot({ x: 100, y: 400, size: 40 });
  assert.equal(JSON.stringify(takeFirstWinCoinSpot()), JSON.stringify({ x: 100, y: 400, size: 40 }));
  assert.equal(takeFirstWinCoinSpot(), null, 'used once');
  setFirstWinCoinSpot({ x: 1, y: 2, size: 40 });
  assert.equal(takeFirstWinCoinSpot(4000, Date.now() + 5000), null, 'stale spots are ignored');
  const taste = read('src/screens/ExploreScreen/GuestTaste.tsx');
  assert.match(taste, /takeFirstWinCoinSpot\(\)/);
  assert.match(taste, /translateX: from\.x \* \(1 - t\) \+ SLOT_ONE_X \* t/);
});

test('while Finn owns the map, the find chip and the safety tip wait', () => {
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /if \(!quietRef\.current\) setChip\(/);
  assert.match(home, /if \(safetyLineShown \|\| !homeLocationConfirmed \|\| quiet\) return;/);
  const teacher = read('src/components/Tutorial/TeacherShark.tsx');
  assert.match(teacher, /if \(beside\) return \{ bottom: bottomOffset - 8/);
});

test('Reduce Motion: the results card never hangs at opacity 0, and the CLEARED sign stays up', () => {
  const shell = read('src/gamekit/GameShellV2.tsx');
  // Root cause of the first-win freeze: in Reduce Motion the results value jumps 0 -> 1 with no
  // animation, and a jump that lands before the animated style is hooked up is never drawn.
  assert.equal((shell.match(/reducedMotion \? styles\.resultsStill : resultsStyle/g) || []).length, 2, 'both results cards');
  assert.match(shell, /resultsStill: \{ opacity: 1, transform: \[\{ scale: 1 \}\] \}/);
  const booth = read('src/games/memory/MemoryBooth.tsx');
  // Reanimated finishes timings at once under the system Reduce Motion, so a delayed fade-out hid the sign.
  assert.match(booth, /if \(!reducedMotion\) out\.value = withDelay\(delay \+ 1100/);
});

// Wave 2, round 2 -----------------------------------------------------------

test('first visit: "Let\'s hunt!" leads to hunting; the daily chest waits for a second catch or 30 s of free hunting', () => {
  const q = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');
  const base = { firstVisit: true, catchesThisVisit: 1, huntStartedAt: null, now: 1000 };
  assert.equal(q.firstVisitChestWaits(base), true, 'Finn is still talking');
  assert.equal(q.firstVisitChestWaits({ ...base, huntStartedAt: 1000, now: 1000 + q.FIRST_VISIT_CHEST_WAIT_MS - 1 }), true);
  assert.equal(q.firstVisitChestWaits({ ...base, huntStartedAt: 1000, now: 1000 + q.FIRST_VISIT_CHEST_WAIT_MS }), false);
  assert.equal(q.firstVisitChestWaits({ ...base, catchesThisVisit: 2 }), false, 'a second catch frees the chest');
  assert.equal(q.firstVisitChestWaits({ ...base, firstVisit: false }), false, 'returning players are unchanged');
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const chestReady = !firstVisitHold && chestMayPresent\(/);
  assert.match(explore, /simple=\{!!firstVisit\.current\}/);
  const chest = read('src/components/DailyGiftModal.tsx');
  assert.match(chest, /\{simple \? null : <View style=\{styles\.ladder\}>/, 'first visit: no 7-day strip');
  assert.match(chest, /simple && phase === 'closed' && <TapHint/, 'a hand taps the one big chest');
});

test('while Finn talks the map corner buttons step out of the way (a plain view, so chromeFade cannot override it)', () => {
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /<View style=\{\[StyleSheet\.absoluteFill, quiet && styles\.hidden\]\} pointerEvents=\{quiet \? 'none' : 'box-none'\}>\s*<Animated\.View style=\{\[StyleSheet\.absoluteFill, chromeFade\]\}/);
});

test('warm-up: CLEARED starts the moment the last pair goes, and the sky above the booth is filled with existing art', () => {
  const game = read('src/games/memory/MemoryGame.tsx');
  assert.match(game, /const signNow = r\.mode === 'warmup';\s*if \(signNow\) awning\.current\?\.sign\('CLEARED'\);/);
  assert.match(game, /&& !signNow\) awning\.current\?\.sign\('CLEARED'\)/, 'never a second sign');
  assert.match(game, /mode === 'warmup' \? <WarmupSky g=\{g\} \/> : null/);
  assert.match(game, /gate_rush_bunting\.png/);
  // The game's own outlined cloud line art, not the flat map blob.
  assert.match(game, /memory\/v8\/fx\/cloud_puff_2\.png/);
  assert.doesNotMatch(game, /screens\/explore\/cloud\.png/);
});

test('first-win card: the ride car and a 62 pt coin sit side by side above the line, block at the optical centre', () => {
  const results = read('src/games/memory/MemoryResults.tsx');
  assert.match(results, /firstWinPic: \{ flexDirection: 'row'/);
  assert.match(results, /firstWinCoin: \{ width: 62, height: 62 \}/);
  assert.match(results, /const lift = Math\.max\(0, finn \* FIRST_WIN_FINN_OVERHANG - 9\);/, 'the whole overhang: a centred column moves the card by half its margin');
  assert.match(results, /marginTop: -finn \* FIRST_WIN_FINN_OVERHANG \}/);
  // Block centring math for SE, 17 Pro and Pro Max: equal sea above the hat and below the card.
  for (const h of [667, 874, 956]) {
    const finn = Math.min(232, h * 0.26), over = finn * 0.62 - 9, card = 300 + finn * 0.38;
    const top = (h - card) / 2 + over / 2 - over, bottom = h - ((h - card) / 2 + over / 2 + card);
    assert.ok(Math.abs(top - bottom) < 1, `height ${h}: block centred`);
    assert.ok(top > 24, `height ${h}: Finn's hat clears the status bar`);
  }
  assert.match(results, /styles\.firstWinCard, \{ marginTop: lift \}/);
  assert.doesNotMatch(results, /firstWinCoinSpot: \{ position: 'absolute'/, 'the coin no longer sits on top of the car');
});

test('shelf hand-off: the shelf is mounted hidden during the game, and the card coin is drawn on frame one', () => {
  const taste = read('src/screens/ExploreScreen/GuestTaste.tsx');
  assert.match(taste, /\(step === 'coin' \|\| step === 'play'\) && <ShelfCoinLanding active=\{step === 'coin'\}/);
  assert.match(taste, /spot && origin && !bridgeOff/);
  assert.match(taste, /initialWidth=\{rowWidth\}/);
  assert.match(taste, /sharkSource=\{FINN_BOATER\}/, 'the same boater Finn as the warm-up');
  assert.match(taste, /text="" sharkSource/, 'You won! plus the coin picture, no extra line');
  const shelf = read('src/components/ParkShelfArtwork.tsx');
  assert.match(shelf, /useState\(initialWidth > 0 \? initialWidth : 0\)/);
  const card = taste.slice(taste.indexOf('function SaveCard'), taste.indexOf('function ProgressDots'));
  assert.doesNotMatch(card, /<Text style=\{styles\.body\}>/, 'title and one line above the button');
});

test('Reduce Motion: the sign-in card and the location primer never use an entering animation (it left them invisible)', () => {
  const taste = read('src/screens/ExploreScreen/GuestTaste.tsx');
  const card = taste.slice(taste.indexOf('function SaveCard'), taste.indexOf('function ProgressDots'));
  assert.match(card, /entering=\{reduced \? undefined : FadeIn\.duration\(260\)\}/);
  assert.match(taste, /<SaveCard reduced=\{reduced\}/);
  const primer = read('src/screens/ExploreScreen/PermissionsNotGranted.tsx');
  assert.doesNotMatch(primer, /entering=\{(FadeInUp|ZoomIn)/, 'every entering is guarded');
  assert.match(primer, /if \(preference === null\) return/);
  for (const file of ['src/screens/ExploreScreen/GuestTaste.tsx', 'src/screens/ExploreScreen/PermissionsNotGranted.tsx']) {
    for (const m of read(file).matchAll(/entering=\{([^}]*)\}/g)) assert.match(m[1], /^(reduced|undefined)/, `${file}: ${m[1]}`);
  }
});

test('home hello: Finn says hi in one short line, the same word (treats) everywhere', () => {
  const steps = read('src/components/Tutorial/steps.ts');
  assert.doesNotMatch(steps, /Hey, new shark/);
  assert.match(steps, /text: "Hi, I'm Finn! Treats pop up near you, even at home\.",\s*subtitle: 'One is right next to you!'/);
});

test('one Finn from the win through the ask: the sign-in card uses the same boater Finn, waving', () => {
  const taste = read('src/screens/ExploreScreen/GuestTaste.tsx');
  const card = taste.slice(taste.indexOf('function SaveCard'), taste.indexOf('function ProgressDots'));
  assert.match(taste, /FINN_BOATER_WAVE = require\('..\/..\/assets\/games\/memory\/studio\/barker_wave\.png'\)/);
  assert.match(card, /source=\{FINN_BOATER_WAVE\}/);
  assert.doesNotMatch(card, /teacher-shark|source=\{FINN\}/, 'no graduation-gown Finn before sign-in');
});

test('one word for one thing: every kid-facing line in minute one says treats, never finds or treasures', () => {
  const intro = read('src/screens/ExploreScreen/HomeIntro.tsx');
  const steps = intro.slice(intro.indexOf('HOME_INTRO_STEPS'), intro.indexOf('function storageKey'));
  assert.match(steps, /title: 'Treats pop up near you'/);
  assert.doesNotMatch(steps, /'[^']*\b[Ff]inds?\b[^']*'/, 'no "find" in the intro cards a kid reads');
  const primer = read('src/screens/ExploreScreen/PermissionsNotGranted.tsx');
  assert.doesNotMatch(primer, /[Tt]reasures?/);
  assert.match(primer, /Treats pop up near you, even at home!/);
  const look = loadTs('src/screens/ExploreScreen/findPresentation.ts');
  assert.equal(look.mapStatusLine({ homeLocationConfirmed: true, isLoading: true, empty: true, loadError: false }).text, 'Scouting for treats...');
  assert.match(read('src/screens/ExploreScreen/HomeExplore.tsx'), /'A treat is close! Tap it to catch\.'/);
});

test('first-win card: two words under the ride car and coin picture', () => {
  const results = read('src/games/memory/MemoryResults.tsx');
  assert.match(results, /FIRST_WIN_COPY = \{ next: 'Ride coins!', a11y: 'Next, win ride coins!' \}/);
  assert.match(results, /accessibilityLabel=\{`\$\{banner\} \$\{FIRST_WIN_COPY\.a11y\}`\}/);
});

test('first hunt: the map shows only the treats (footsteps, no metres, no Saved map pill) and a failed load heals itself', () => {
  const look = loadTs('src/screens/ExploreScreen/findPresentation.ts');
  const base = { homeLocationConfirmed: true, isLoading: false, empty: false, loadError: true };
  assert.equal(look.mapStatusLine({ ...base, firstHunt: true }), null, 'no grown-up words on the first map');
  assert.equal(look.mapStatusLine(base).text, 'Saved map · tap to refresh', 'later visits keep the line');
  assert.equal(look.mapStatusLine({ ...base, empty: true, firstHunt: true }).action, 'retry', 'an empty map still offers a retry');
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /const firstHunt = !!firstVisit\.current && catchesThisVisit < 2;/);
  assert.match(explore, /firstHunt=\{firstHunt\}/);
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /plainDistance=\{firstHunt\}/);
  assert.match(home, /AUTO_RETRY_MS = \[5_000, 15_000, 30_000\]/);
  assert.match(home, /autoRetry\.onFailure\(\);/, 'every failure arms the next retry (not only the first)');
  assert.match(home, /autoRetry\.onSuccess\(\);/);
  assert.match(home, /loadPrepItemsRef\.current\(autoRetry\.consumeOwed\(\)\)/, 'a retry owed while backgrounded runs on return');
  assert.match(home, /firstHunt, healGaveUp \}\)/);
  const marker = read('src/screens/ExploreScreen/PrepItem.tsx');
  assert.match(marker, /!inRange && !far && <Image source=\{FOOTSTEPS\}/, 'footsteps alone when there is no number');
});

test('warm-up: a pointing hand sits on a card until the first real tap, for a kid who cannot read the header', () => {
  const game = read('src/games/memory/MemoryGame.tsx');
  assert.match(game, /const \[warmHint, setWarmHint\] = useState\(mode === 'warmup'\);/);
  assert.match(game, /if \(warmHintRef\.current\) \{ warmHintRef\.current = false; setWarmHint\(false\); \}/);
  const tap = game.slice(game.indexOf('const tapSlot = useCallback'));
  assert.ok(tap.indexOf('warmHintRef.current = false') > tap.indexOf("if (!r.playing || r.ended"), 'only a real, legal tap clears it');
  assert.match(game, /mode === 'warmup' && warmHint && !resultData \? \(\s*\/\/[^\n]*\n\s*<TapHint delay=\{WARMUP_HINT_DELAY_MS\}/);
});

test('sign-in card: Finn plus card sit mid-sea on tall phones (his overhang counted), never pushed down on short ones', () => {
  const taste = read('src/screens/ExploreScreen/GuestTaste.tsx');
  assert.match(taste, /<SaveCard reduced=\{reduced\} compact=\{short\}/);
  assert.match(taste, /style=\{\[styles\.card, !compact && styles\.cardCentred\]\}/);
  assert.match(taste, /cardCentred: \{ marginTop: 80 \}/);
});

test('map auto-retry: 3 failures in a row retry at 5, 15 and 30 s, then a success resets it', () => {
  const { createMapAutoRetry } = loadTs('src/screens/ExploreScreen/mapAutoRetry.ts');
  const timers = [];
  let runs = 0; let gaveUp = 0; let active = true;
  const retry = createMapAutoRetry({
    delays: [5000, 15000, 30000], canRun: () => active, run: () => { runs += 1; }, onGiveUp: () => { gaveUp += 1; },
    setTimer: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    clearTimer: t => { t.live = false; },
  });
  const fire = () => { const t = timers.filter(x => x.live).pop(); t.live = false; t.fn(); return t.ms; };
  retry.onFailure();
  assert.equal(fire(), 5000); assert.equal(runs, 1);
  retry.onFailure();
  assert.equal(fire(), 15000); assert.equal(runs, 2);
  retry.onFailure();
  assert.equal(fire(), 30000); assert.equal(runs, 3);
  assert.equal(gaveUp, 0);
  retry.onSuccess();
  assert.equal(retry.failures(), 0);
  // A fresh failure starts again at 5 s.
  retry.onFailure();
  assert.equal(timers.filter(x => x.live)[0].ms, 5000);
  retry.dispose();
  assert.equal(timers.filter(x => x.live).length, 0);
});

test('map auto-retry: a retry due while off screen is owed and runs on return; the 4th failure gives up once', () => {
  const { createMapAutoRetry } = loadTs('src/screens/ExploreScreen/mapAutoRetry.ts');
  const timers = [];
  let runs = 0; let gaveUp = 0; let active = false;
  const retry = createMapAutoRetry({
    delays: [5000, 15000, 30000], canRun: () => active, run: () => { runs += 1; }, onGiveUp: () => { gaveUp += 1; },
    setTimer: (fn, ms) => { const t = { fn, ms, live: true }; timers.push(t); return t; },
    clearTimer: t => { t.live = false; },
  });
  retry.onFailure();
  timers[0].live = false; timers[0].fn();
  assert.equal(runs, 0, 'never loads while the map is away');
  assert.equal(retry.consumeOwed(), true, 'the skipped retry is kept');
  assert.equal(retry.consumeOwed(), false, 'and used once');
  active = true;
  retry.onFailure(); retry.onFailure(); retry.onFailure();
  assert.equal(gaveUp, 1);
  retry.onFailure();
  assert.equal(gaveUp, 1, 'no repeat cue');
  const look = loadTs('src/screens/ExploreScreen/findPresentation.ts');
  const base = { homeLocationConfirmed: true, isLoading: false, empty: false, loadError: true, firstHunt: true };
  assert.equal(look.mapStatusLine(base), null, 'silent while healing');
  const cue = look.mapStatusLine({ ...base, healGaveUp: true });
  assert.equal(cue.icon, 'retry'); assert.equal(cue.action, 'retry'); assert.equal(cue.text, 'Try again');
});

test('first hunt: a treat in range while Finn says "Let\'s hunt!" is never held and opened as a second catch', () => {
  const source = read('src/screens/ExploreScreen.tsx');
  const handler = source.slice(source.indexOf('const handlePrepItemNearby = useCallback'), source.indexOf('setTooFarRequiredMeters(HOME_PREP_PICKUP_RADIUS_METERS)'));
  const bail = handler.indexOf("if (source === 'auto' && !finnsFirstFind) return;");
  const hold = handler.indexOf('setPendingFind({ item: prepItem, pivotId })');
  assert.ok(bail > 0 && hold > 0 && bail < hold, 'an auto find after onboarding returns before it can be held');
  // The 30 s hold still ends only on a real second catch or the clock.
  const queue = loadTs('src/screens/ExploreScreen/mapPresentationQueue.ts');
  assert.equal(queue.firstVisitChestWaits({ firstVisit: true, catchesThisVisit: 1, huntStartedAt: 1000, now: 1000 + 29_000 }), true);
  assert.equal(queue.firstVisitChestWaits({ firstVisit: true, catchesThisVisit: 1, huntStartedAt: 1000, now: 1000 + 30_000 }), false);
});

test('one boater Finn from the first frame: the churro find, the Play step, the shelf and the ask all use the barker art', () => {
  const taste = read('src/screens/ExploreScreen/GuestTaste.tsx');
  assert.match(taste, /sharkSource=\{step === 'find' \? \(yum \? FINN_BOATER : FINN_BOATER_WAVE\) : FINN_BOATER_GAME\}/);
  assert.match(taste, /FINN_BOATER_GAME = require\('\.\.\/\.\.\/assets\/games\/memory\/studio\/barker_fist_pump\.png'\)/);
  // Every TeacherShark in the guest taste names its Finn (none falls back to the gown art).
  const sharks = taste.match(/<TeacherShark[\s\S]*?\/>/g) ?? [];
  assert.equal(sharks.length, 2);
  for (const shark of sharks) assert.match(shark, /sharkSource=/);
});

test('shelf moment: the shelf and Finn beside his "You won!" bubble are one centred group', () => {
  const taste = read('src/screens/ExploreScreen/GuestTaste.tsx');
  assert.match(taste, /const shelfGroupBottom = size && !short \? Math\.max\(40, Math\.round\(\(size\.h - \(shelfH \+ SHELF_FINN_GAP \+ SHELF_FINN_H\)\) \/ 2\)\) : null;/);
  assert.match(taste, /beside=\{shelfGroupBottom != null\}/);
  assert.match(taste, /bottomOffset=\{shelfGroupBottom != null \? shelfGroupBottom \+ 8 : short \? 26 : 48\}/);
  assert.match(taste, /groupBottom=\{shelfGroupBottom == null \? null : shelfGroupBottom \+ SHELF_FINN_H \+ SHELF_FINN_GAP\}/);
  // 17 Pro sea (672 pt): equal sea above the shelf and below Finn.
  const h = 672, shelf = 236, group = shelf + 14 + 120;
  const bottom = Math.max(40, Math.round((h - group) / 2));
  assert.equal(h - (bottom + group), bottom);
});

test('warm-up sky: four outlined clouds and a two-card picture cue replace the small subtitle', () => {
  const game = read('src/games/memory/MemoryGame.tsx');
  assert.match(game, /mode === 'warmup' \? undefined : deck\.label;/);
  assert.doesNotMatch(game, /Match 4 pairs with Finn/);
  const sky = game.slice(game.indexOf('function WarmupSky'), game.indexOf('function MatchCue'));
  assert.equal((sky.match(/src: SKY_CLOUD(_SMALL)?,/g) ?? []).length, 4, 'four clouds');
  assert.equal((game.match(/<Image source=\{MATCH_CUE_CARD\}/g) ?? []).length, 2, 'two matching cards');
  assert.equal((sky.match(/<MatchCue /g) ?? []).length, 2, 'the cue shows on tall phones and, right of Finn, on short ones');
  assert.match(game, /accessibilityLabel="Find two cards that match"/);
  assert.doesNotMatch(sky, /withTiming|withRepeat|useSharedValue/, 'still images only');
});

test('first hunt map: no Trail Box pill or badge, no chest buttons during the 30 s, ticket chip dimmed, level chests wait too', () => {
  const explore = read('src/screens/ExploreScreen.tsx');
  assert.match(explore, /\{player && !park && permissionGranted && !firstHunt && !finnOwnsMap && \(\s*<View pointerEvents="box-none"[^>]*>\s*<TrailHost/);
  assert.match(explore, /const mapControlsCount = firstVisitHold \? 0 :/);
  assert.match(explore, /const mapControls = mapControlsCount > 0 \?/);
  assert.match(explore, /screenFree: chestScreenFree && !firstVisitHold && !chestShowing/);
  const home = read('src/screens/ExploreScreen/HomeExplore.tsx');
  assert.match(home, /trailHidden=\{firstHunt\}/);
  assert.match(home, /firstHunt && styles\.hudDim/);
  assert.match(read('src/components/Map.tsx'), /<TrailBoxBadge trail=\{trailHidden \? null : liveTrail\} live=\{lifeOn\} \/>/);
});

test('first-win card: its pictures are mounted (invisible) during the warm-up, so frame one is whole', () => {
  const results = read('src/games/memory/MemoryResults.tsx');
  assert.match(results, /export const FIRST_WIN_ART = \[FINN_CHEER, FIRST_WIN_COIN, FIRST_WIN_RIDE, FIRST_WIN_BACKDROP, BANNER, SHOWER_BUBBLE, SHOWER_SPARKLE\] as const;/);
  const game = read('src/games/memory/MemoryGame.tsx');
  assert.match(game, /\{mode === 'warmup' \? \(\s*<View style=\{styles\.preload\}[^>]*>\s*\{FIRST_WIN_ART\.map/);
  assert.match(game, /preload: \{ position: 'absolute', left: 0, top: 0, width: 24, height: 24, opacity: 0/);
});
