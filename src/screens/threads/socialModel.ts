/**
 * Shark Social: pure rules shared by the feed, the post screen and the
 * composer. No React here so the tests can run every rule directly.
 */

import RULES from './safetextRules.json';
import SAFE_CHAT from './safeChatPhrases.json';

export type TopicKey = 'park_day' | 'rides' | 'snacks' | 'outfits' | 'collections' | 'ask';
export type FeedTab = 'hottest' | 'latest' | 'friends' | 'team';

export interface TopicDef {
  readonly key: TopicKey;
  readonly label: string;
  /** Placeholder in the composer once this topic is picked. */
  readonly prompt: string;
  /** Card badge colour (light chip) and ink. */
  readonly color: string;
  readonly chip: string;
}

/** What kids actually post: park days, rides, snacks, outfits, collections, questions. */
export const TOPICS: readonly TopicDef[] = [
  { key: 'park_day', label: 'Park Day', prompt: 'Which park are you at today?', color: '#2fb35d', chip: '#dcf6e5' },
  { key: 'rides', label: 'Rides', prompt: 'What ride did you just do?', color: '#0879ca', chip: '#dbefff' },
  { key: 'snacks', label: 'Snacks', prompt: 'What yummy snack did you get?', color: '#ff7a1a', chip: '#ffe8d4' },
  { key: 'outfits', label: 'Outfits', prompt: 'Tell us about your park outfit!', color: '#e0457b', chip: '#ffe0ec' },
  { key: 'collections', label: 'Collections', prompt: 'What did you add to your collection?', color: '#9b4dff', chip: '#eee2ff' },
  { key: 'ask', label: 'Ask', prompt: 'Ask the Shark fam a question!', color: '#c98a00', chip: '#fff1c2' },
];

export const DEFAULT_PROMPT = 'Share your park day!';

export function topicFor(key: unknown): TopicDef | null {
  return TOPICS.find((topic) => topic.key === key) ?? null;
}

export const POST_MAX = 500;

/**
 * One-tap replies (like quick chat in kids' games): kind, fixed, easy to
 * read, nothing to type or filter.
 */
export const QUICK_REPLIES = ['So cool!', 'Same!', 'You did it!', 'I want to go!', 'Love it!', 'Congrats!', 'Trade in Pin Swap?'] as const;

// ── Safe Chat (the Club Penguin way) ──
// Posts and replies built from curated phrases (safeChatPhrases.json, a copy of the server's
// resources/safechat/phrases.json) and, for a phrase with a blank, a park, ride or food name
// from our own data. The server builds the text from ids and publishes it at once.

export type SafeChatSlot = 'ride' | 'park' | 'food';
export interface SafeChatPhrase { readonly id: string; readonly text: string }
export interface SafeChatCategory { readonly key: string; readonly title: string; readonly icon: string; readonly phrases: readonly SafeChatPhrase[] }
export interface SafeChatPlace { readonly id: string; readonly kind: SafeChatSlot; readonly name: string; readonly park_id: number }
export interface SafeChatPick { readonly phrase: string; readonly place?: string | null }

export const SAFE_CHAT_CATEGORIES: readonly SafeChatCategory[] = SAFE_CHAT.categories;
const PHRASE_BY_ID = new Map(SAFE_CHAT_CATEGORIES.flatMap((c) => c.phrases.map((p) => [p.id, p] as const)));

/** The quick-reply chips are Safe Chat phrases, so a tap publishes at once. */
export const QUICK_REPLY_IDS: readonly string[] = QUICK_REPLIES.map((text) => {
  const hit = SAFE_CHAT_CATEGORIES.find((c) => c.key === 'replies')?.phrases.find((p) => p.text === text);
  if (!hit) throw new Error(`quick reply "${text}" is not a Safe Chat phrase`);
  return hit.id;
});

export function phraseById(id: string | null | undefined): SafeChatPhrase | null {
  return (id && PHRASE_BY_ID.get(id)) || null;
}

export function phraseSlot(text: string): SafeChatSlot | null {
  const m = /\{(ride|park|food)\}/.exec(text);
  return m ? (m[1] as SafeChatSlot) : null;
}

/** What a phrase looks like before a place is picked: "{ride} was SO fun!" -> "[ride] was SO fun!". */
export function phraseLabel(text: string): string {
  return text.replace(/\{(ride|park|food)\}/, (_m, slot: string) => `[${slot}]`);
}

/** The exact text the server will build, or null while a slot is still empty. */
export function composeSafeChat(pick: SafeChatPick | null, places: readonly SafeChatPlace[]): string | null {
  const phrase = phraseById(pick?.phrase);
  if (!phrase) return null;
  let text = phrase.text;
  const slot = phraseSlot(text);
  if (slot) {
    const place = places.find((p) => p.id === pick?.place);
    if (!place || place.kind !== slot) return null;
    text = text.replace(`{${slot}}`, place.name);
  }
  return text;
}

/** Picking a topic opens the matching Safe Chat category. */
export function categoryForTopic(topic: TopicKey | null): string {
  if (!topic) return 'cheers';
  return ({ park_day: 'parks', rides: 'rides', snacks: 'food', outfits: 'outfits', collections: 'collections', ask: 'questions' } as Record<TopicKey, string>)[topic] ?? 'cheers';
}

/** The line next to free text while AI review is off: honest about the wait. */
export const FREE_TEXT_LINE = 'A grown-up from Theme Park Shark checks what you write before others see it. Safe Chat posts go up right away!';
export const REPLY_MAX = 300;

/**
 * Kid-positive reactions in the picker. Mad and Sad stay readable on old
 * posts but are not offered (a "Mad" face on a kid's ride photo reads as mean).
 */
export const PICKER_REACTIONS = ['love', 'happy', 'laugh', 'wow'] as const;

export function pickerReactions<T extends { name: string }>(types: readonly T[]): T[] {
  const byName = new Map(types.map((type) => [type.name.toLowerCase(), type]));
  const picked = PICKER_REACTIONS.map((name) => byName.get(name)).filter(Boolean) as T[];
  return picked.length ? picked : [...types];
}

// ── Draft checks (mirror the server's SafeText so kids see why before posting) ──

export type DraftProblem = 'empty' | 'too_long' | 'personal_info' | 'grooming' | 'link';

/** Added to contact and grooming lines (same as SafeText::SAFE_LINE). */
export const SAFE_LINE = 'If something is wrong or you feel unsafe, tell a grown-up you trust.';

export const DRAFT_LINES: Readonly<Record<DraftProblem, string>> = {
  empty: 'Write something first!',
  too_long: 'That is a lot of words! Try a shorter post.',
  personal_info: `Stay safe! Don't share phone numbers, addresses, emails or other apps. ${SAFE_LINE}`,
  grooming: `Let's keep it about parks. Don't ask people their age, school, or where they are. ${SAFE_LINE}`,
  link: `Links can't be posted here. ${SAFE_LINE}`,
};

/*
 * The server's SafeText checks, run on the same shared rule table
 * (safetextRules.json is a copy of backend resources/safetext/rules.json), so
 * a kid sees the reason before posting. The server stays the gate;
 * tools/tests/fixtures/safetext_cases.json is shared and both must pass it.
 */

const CONFUSABLES: Record<string, string> = RULES.confusables;
const DIGIT_GLYPHS: Record<string, string> = RULES.digit_glyphs;
const INVISIBLE: readonly (readonly number[])[] = RULES.invisible_ranges;
const UNITS = new Set<string>(RULES.units);
const JOIN = new Set<string>(RULES.join_keywords);
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'l' };
const NUMBER_WORDS: Record<string, string> = RULES.number_words;
const AMBIGUOUS = new Set<string>(RULES.ambiguous_number_words);
const CONNECTORS = new Set<string>(RULES.run_connectors);

function compile(list: readonly string[]): RegExp[] {
  return list.map((pattern) => {
    let source = pattern;
    for (const [name, value] of Object.entries(RULES.vars)) source = source.split(`{${name}}`).join(value);
    return new RegExp(source, 'iu');
  });
}
const PERSONAL_PATTERNS = compile(RULES.personal);
const GROOMING_PATTERNS = compile(RULES.grooming);
const DESPACED = RULES.despaced.map((source) => new RegExp(source, 'u'));
const DESPACED_PERSONAL = RULES.despaced_personal.map((source) => new RegExp(source, 'u'));
const LOCATION_NOW = compile(RULES.location_now);
const PHONE_CUES: readonly string[] = RULES.phone_cues;
const DISTRESS = compile(RULES.distress);
const REVIEW_YOU = compile([RULES.review_you])[0];
const REVIEW_TOPICS = compile([RULES.review_topics])[0];
const REVIEW_PHRASES = compile(RULES.review_phrases);
const REVIEW_EXEMPT = compile(RULES.review_exempt).map((re) => new RegExp(re.source, 'giu'));
const REVIEW_EXEMPT_NOUNS = new RegExp(compile([RULES.review_exempt_nouns])[0].source, 'giu');
const CARE_NEAR = compile([
  `${RULES.care_me}(?:\\s+\\S+){0,${RULES.care_window - 1}}?\\s+${RULES.care_words}`,
  `${RULES.care_words}(?:\\s+\\S+){0,${RULES.care_window - 1}}?\\s+${RULES.care_me}`,
]);
const CARE_EXEMPT = compile(RULES.care_exempt).map((re) => new RegExp(re.source, 'giu'));
const CARE_WIDE = compile([
  `${RULES.care_wide_me}(?:\\s+\\S+){0,${RULES.care_wide_window - 1}}?\\s+${RULES.care_wide_words}`,
  `${RULES.care_wide_words}(?:\\s+\\S+){0,${RULES.care_wide_window - 1}}?\\s+${RULES.care_wide_me}`,
  ...RULES.care_wide_extra,
]);
const CARE_WIDE_EXEMPT = compile(RULES.care_wide_exempt).map((re) => new RegExp(re.source, 'giu'));
const CARE_A_EXEMPT = compile(RULES.care_a_exempt).map((re) => new RegExp(re.source, 'giu'));
const TENS: Record<string, string> = RULES.tens;
const TEENS: Record<string, string> = RULES.teens;
const ONES: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9 };
const TENS_ONES = new RegExp(`\\b(${Object.keys(TENS).join('|')})[\\s-]*(${Object.keys(ONES).join('|')})\\b`, 'gu');
const TENS_ALONE = new RegExp(`\\b(${Object.keys(TENS).join('|')})\\b`, 'gu');
const TEENS_RE = new RegExp(`\\b(${Object.keys(TEENS).join('|')})\\b`, 'gu');
const RUN_EXEMPT_AFTER = new Set<string>(RULES.run_exempt_after);

function baseForm(text: string): string {
  // Invisible characters (zero-width, soft hyphen, variation selectors, keycap marks) go first.
  let kept = '';
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (INVISIBLE.some(([from, to]) => cp >= from && cp <= to)) continue;
    kept += DIGIT_GLYPHS[ch] ?? ch;
  }
  // Regional indicators and enclosed/squared letters spell letters.
  kept = kept.replace(/[\u{1F1E6}-\u{1F1FF}\u{1F130}-\u{1F189}]/gu, (ch) => {
    const cp = ch.codePointAt(0) ?? 0;
    const index = cp >= 0x1f1e6 ? cp - 0x1f1e6 : (cp - 0x1f130) % 32;
    return String.fromCharCode(97 + index);
  });
  // NFKC, look-alikes, then accents off (NFD, drop combining marks).
  const folded = [...kept.normalize('NFKC').toLowerCase()].map((ch) => CONFUSABLES[ch] ?? ch).join('').normalize('NFD').replace(/\p{M}/gu, '');
  // Any remaining decimal digit becomes ASCII: its value is its distance from its block's zero.
  return folded.replace(/(?![0-9])\p{Nd}/gu, (d) => {
    const cp = d.codePointAt(0) ?? 0;
    let steps = 0;
    while (steps < 60 && /^\p{Nd}$/u.test(String.fromCodePoint(cp - steps - 1))) steps++;
    return String(steps % 10);
  });
}

/** Short fragments that spell a rule keyword are joined: "sn ap" -> "snap". */
function joinFragments(text: string): string {
  const tokens = text.split(' ');
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    let done = false;
    for (let k = 3; k >= 2 && !done; k--) {
      if (i + k > tokens.length) continue;
      const parts = tokens.slice(i, i + k);
      if (Math.max(...parts.map((p) => [...p].length)) > 3) continue;
      const word = parts.join('');
      if (JOIN.has(word)) {
        out.push(word);
        i += k - 1;
        done = true;
      }
    }
    if (!done) out.push(tokens[i]);
  }
  return out.join(' ');
}

const despace = (text: string) => [wordForm(text, false), wordForm(text)].map((f) => f.replace(/[^a-z]/g, ''));

function wordForm(text: string, leet = true): string {
  let t = baseForm(text).replace(/[’‘`]/g, "'");
  if (leet) t = t.replace(/[a-z0-9@$!|]*[a-z][a-z0-9@$!|]*/g, (w) => [...w].map((ch) => LEET[ch] ?? ch).join(''));
  t = t.replace(/(?<=\w)[*#%^~]+(?=\w)/g, '').replace(/'/g, '').replace(/[^\p{L}\p{N}\s#/]/gu, ' ');
  t = t.replace(/(\p{L})\1{2,}/gu, '$1$1');
  return t.replace(/\s+/g, ' ').trim();
}

/** "m e e t me" -> "meet me" (three or more single letters in a row). */
function joinSingles(text: string): string {
  return text.replace(/(?<![\p{L}\p{N}])\p{L}(?:\s+\p{L}(?![\p{L}\p{N}])){2,}/gu, (m) => m.replace(/\s+/g, ''));
}

function forms(text: string): string[] {
  const plain = wordForm(text, false);
  const leet = wordForm(text);
  const base = baseForm(text);
  return [...new Set([leet, plain, base, joinSingles(plain), joinSingles(leet), joinSingles(base), joinFragments(plain), joinFragments(leet)])];
}

const matchesAny = (patterns: RegExp[], all: string[]) => patterns.some((p) => all.some((f) => p.test(f)));

const GLUE_VOCAB = Object.entries(NUMBER_WORDS).filter(([w]) => !['o', 'to', 'too', 'for', 'won', 'ate'].includes(w));

function numericToken(token: string): string | null {
  if (/^\d+$/.test(token)) return token;
  if (token in NUMBER_WORDS) return NUMBER_WORDS[token];
  if (/\d/.test(token)) {
    const folded = token.replace(/[olis|]/g, (c) => (c === 'o' ? '0' : c === 's' ? '5' : '1'));
    if (/^\d+$/.test(folded)) return folded;
  }
  const n = token.length;
  if (n < 4 || !/^[a-z0-9]+$/.test(token)) return null;
  const best: (string | undefined)[] = [''];
  for (let i = 0; i < n; i++) {
    const here = best[i];
    if (here === undefined) continue;
    if (/\d/.test(token[i]) && best[i + 1] === undefined) best[i + 1] = here + token[i];
    for (const [word, digit] of GLUE_VOCAB) {
      if (token.startsWith(word, i) && best[i + word.length] === undefined) best[i + word.length] = here + digit;
    }
  }
  const out = best[n];
  if (out !== undefined && out.length >= 2) return out;
  // Long glued runs with a typo or two ("zeroonenineninine"): up to 2 stray letters, 4+ digits.
  if (n < 10) return null;
  const state: Map<number, string>[] = [new Map([[0, '']])];
  const put = (pos: number, skips: number, digits: string) => {
    state[pos] ??= new Map();
    if (!state[pos].has(skips)) state[pos].set(skips, digits);
  };
  for (let i = 0; i < n; i++) {
    for (const [skips, digits] of state[i] ?? []) {
      if (/\d/.test(token[i])) put(i + 1, skips, digits + token[i]);
      for (const [word, digit] of GLUE_VOCAB) if (token.startsWith(word, i)) put(i + word.length, skips, digits + digit);
      if (skips < 2) put(i + 1, skips + 1, digits);
    }
  }
  for (const skips of [0, 1, 2]) {
    const got = state[n]?.get(skips);
    if (got !== undefined && got.length >= 4) return got;
  }
  return null;
}

function isCountingRun(run: string): boolean {
  if (run.length < 5) return false;
  let up = true;
  let down = true;
  for (let k = 1; k < run.length; k++) {
    up = up && Number(run[k]) === (Number(run[k - 1]) + 1) % 10;
    down = down && Number(run[k]) === (Number(run[k - 1]) + 9) % 10;
  }
  return up || down;
}

interface DigitRun { groups: string[]; years: boolean; start: number; unit: boolean; after: boolean; afterScore: boolean }

const escapeRe = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** A port of SafeText::looksLikePhone (same rules, same order). */
function looksLikePhone(input: string): boolean {
  const cue = PHONE_CUES.some((word) => new RegExp(`\\b${escapeRe(word)}\\b`, 'u').test(input));
  // Letters slipped between single digits: "7a1b4c5d5e5f0g1h9i9".
  let base = input.replace(/\d(?:[a-z]\d){5,}/gu, (m) => m.replace(/[a-z]/gu, ''));
  // Tens and teens: "fifty five" -> 55, "fourteen" -> 14, "ninety" -> 90.
  base = base.replace(TENS_ONES, (_m, t: string, o: string) => ` ${TENS[t]}${ONES[o]} `)
    .replace(TENS_ALONE, (_m, t: string) => ` ${TENS[t]}0 `)
    .replace(TEENS_RE, (_m, t: string) => ` ${TEENS[t]} `);
  // Real clock times only; with a phone cue ("my numbers 7:14 5:55") they count as digits.
  base = base.replace(/(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/gu, (m, h, mm) => (Number(h) <= 23 && Number(mm) <= 59 ? (cue ? ` ${h} ${mm} ` : ' clock ') : m));
  // "$714 $555 $0199": a "$" on three or more whole-number groups is not three prices.
  if ((base.match(/\$\s?\d+(?![.\d])/gu) ?? []).length >= 3) base = base.replace(/\$\s?(\d+)(?![.\d])/gu, ' $1 ');
  base = base.replace(/\$\s?\d+(\.\d{1,2})?/gu, ' price ');
  base = base.replace(/(?<![\d.])\d{1,3}\.\d{2}(?![\d.])(?=\s*(usd|dollars?|bucks))/gu, ' price ');
  base = base.replace(/(?<![\d.])(?<!\d\s)(?<!\d\s\s)\d{1,3}\.\d{2}(?![\d.])(?!\s{0,2}\d)/gu, ' price ');
  if (/\b(?:\$|usd|dollars?|bucks|cents|price|prices|cost|costs)\b/u.test(base)) base = base.replace(/(?<![\d.])\d{1,3}\.\d{2}(?![\d.])/gu, ' price ');
  base = base.replace(/(?<![\d,])\d{1,3}(,\d{3})+(?![\d,])/gu, (m) => (m.replace(/,/g, '').length <= 7 ? ' amount ' : m.replace(/,/g, ' ')));

  const matches = [...base.matchAll(/[\p{L}\p{N}]+/gu)];
  const tokens = matches.map((m) => m[0]);
  const offsets = matches.map((m) => m.index ?? 0);
  const parsed = tokens.map(numericToken);
  const runs: DigitRun[] = [];
  let run: DigitRun | null = null;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    let digits = parsed[i];
    const neighbour = (i > 0 && parsed[i - 1] !== null && !AMBIGUOUS.has(tokens[i - 1]))
      || (i + 1 < tokens.length && parsed[i + 1] !== null && !AMBIGUOUS.has(tokens[i + 1]));
    if (digits !== null && AMBIGUOUS.has(token) && !neighbour) digits = null;
    if (digits !== null && AMBIGUOUS.has(token) && i > 0 && i + 1 < tokens.length && /^\d{2,}$/.test(tokens[i - 1]) && /^\d{2,}$/.test(tokens[i + 1])) digits = null;
    if (digits !== null) {
      if (!run) {
        const before = tokens.slice(Math.max(0, i - 3), i);
        let after = false;
        before.forEach((word, k) => {
          const pair = k + 1 < before.length ? `${word} ${before[k + 1]}` : word;
          after = after || RUN_EXEMPT_AFTER.has(word) || RUN_EXEMPT_AFTER.has(pair);
        });
        const prev = i > 0 ? tokens[i - 1] : '';
        run = { groups: [], years: true, start: offsets[i], unit: false, after, afterScore: prev === 'score' || prev === 'points' };
      }
      run.groups.push(digits);
      run.years = run.years && (/^(19|20)\d\d$/.test(token) || AMBIGUOUS.has(token));
      continue;
    }
    if (run && CONNECTORS.has(token) && i + 1 < tokens.length && parsed[i + 1] !== null) continue;
    if (run && UNITS.has(token)) run.unit = true;
    if (run) runs.push(run);
    run = null;
  }
  if (run) runs.push(run);

  const candidates: [number, number][] = [];
  for (const r of runs) {
    const all = r.groups.join('');
    const sizes = r.groups.map((g) => g.length);
    const smallGroups = Math.max(...sizes) <= 3 && all.length < 10;
    if (r.years || isCountingRun(all)) continue;
    if ((r.unit && smallGroups) || (r.after && Math.max(...sizes) <= 3 && sizes.length >= 2)) continue;
    if (r.afterScore && sizes.length === 1 && all.length < 10) continue;
    const singles = sizes.every((n) => n === 1);
    const endsLikeLocal = sizes.length >= 2 && sizes[sizes.length - 1] === 4 && sizes[sizes.length - 2] === 3;
    const manySmall = sizes.length >= 3 && Math.max(...sizes) <= 4;
    if (all.length >= 10 || (all.length >= 7 && (sizes.length === 1 || singles || endsLikeLocal || manySmall))) return true;
    candidates.push([r.start, all.length]);
  }
  const windowSize = cue ? Number.MAX_SAFE_INTEGER : 60;
  for (let i = 0; i < candidates.length; i++) {
    let sum = 0;
    for (let j = i; j < candidates.length && candidates[j][0] - candidates[i][0] <= windowSize; j++) {
      sum += candidates[j][1];
      if (sum >= 10 && j > i) return true;
    }
  }
  return false;
}

/** Phone numbers, emails and street addresses. */
export function hasContactDetails(text: string): boolean {
  const base = baseForm(text);
  if (looksLikePhone(base)) return true;
  if (/[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9-]+\s*(\.|\(dot\)|\[dot\])\s*[a-z]{2,}/u.test(base)) return true;
  if (/\b[a-z0-9._]{2,}\s+at\s+[a-z0-9-]+\s+dot\s+(com|net|org|edu|co|us)\b/u.test(wordForm(text, false))) return true;
  let streets = base;
  for (const themed of RULES.themed_streets) streets = streets.split(themed).join(' park street ');
  streets = streets.replace(/\d+\s+park street/gu, ' ');
  return /\b\d{1,6}\s+([a-z]+\s+){1,2}(street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|boulevard|blvd|circle|terrace|parkway|pkwy)\b\.?(\s|,|$)/u.test(streets);
}

export function isGrooming(text: string, includeLocationNow = true): boolean {
  const all = forms(text);
  return (includeLocationNow && matchesAny(LOCATION_NOW, all)) || matchesAny(GROOMING_PATTERNS, all) || matchesAny(DESPACED, despace(text));
}

/** Same as SafeText::countsTowardPause: location-now over-blocks never pause a kid. */
export function countsTowardPause(text: string): boolean {
  return hasContactDetails(text) || hasPersonalInfo(text) || isGrooming(text, false);
}

export function hasPersonalInfo(text: string): boolean {
  return hasContactDetails(text) || matchesAny(PERSONAL_PATTERNS, forms(text)) || matchesAny(DESPACED_PERSONAL, despace(text));
}

export function hasLink(text: string): boolean {
  return /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\s*\.\s*(com|net|org|io|gg|me|co|tv|ly|app|xyz|link|site|us|uk)\b|\b[a-z0-9-]{2,}\s+dot\s+(com|net|org|io|gg|me|co|tv)\b)/u.test(baseForm(text));
}

/**
 * Same as SafeText::isDistress: the author sounds like they may hurt themselves. Never a
 * block: the composer shows CARE_LINE and the server holds the post for a grown-up.
 */
export function isDistress(text: string): boolean {
  return distressWords(text) && !isPlayfulHyperbole(text);
}

/** Same as SafeText::isPlayfulHyperbole: "made me feel like I was going to die lol" is a quiet care check, not 988. */
const DISTRESS_HYPERBOLE = compile(RULES.distress_hyperbole);
function isPlayfulHyperbole(text: string): boolean {
  const all = forms(text);
  return matchesAny(DISTRESS_HYPERBOLE, all) && matchesAny(DISCLOSURE_PLAYFUL, all);
}

function distressWords(text: string): boolean {
  if (text.trim() === '') return false;
  if (matchesAny(DISTRESS, forms(text))) return true;
  // The broad care net: "i" / "me" / "my" within a few words of a death or self-harm word.
  const words = [wordForm(text, false), wordForm(text)].map((w) => [...CARE_EXEMPT, ...CARE_A_EXEMPT].reduce((acc, re) => acc.replace(re, ' '), w));
  return matchesAny(CARE_NEAR, words);
}

/** Same as SafeText::isCareCheck: the wide care check. Dustin-facing only (the post is held anyway), never shown to the kid. */
export function isCareCheck(text: string): boolean {
  if (text.trim() === '') return false;
  if (distressWords(text) && isPlayfulHyperbole(text)) return true;
  const words = [wordForm(text, false), wordForm(text)].map((w) => [...CARE_EXEMPT, ...CARE_WIDE_EXEMPT].reduce((acc, re) => acc.replace(re, ' '), w));
  return matchesAny(CARE_WIDE, words);
}

/** Same as SafeText::isDisclosure: a kid telling us someone hurts them or makes them keep a secret. */
const DISCLOSURE = compile(RULES.disclosure);
const DISCLOSURE_PLAYFUL = compile(RULES.disclosure_playful);
const DISCLOSURE_STRONG = compile(RULES.disclosure_strong);
export function isDisclosure(text: string): boolean {
  if (text.trim() === '') return false;
  const all = forms(text);
  if (!matchesAny(DISCLOSURE, all)) return false;
  // Playful context ("lol", "with a pool noodle") is not a disclosure unless a strong cue is there too.
  return !matchesAny(DISCLOSURE_PLAYFUL, all) || matchesAny(DISCLOSURE_STRONG, all);
}

/** What a kid sees after telling us about abuse or a secret: warm, with Childhelp and 911. Same as the server. */
export const DISCLOSURE_LINE = 'Thank you for telling us. You did the right thing. Please tell a grown-up you trust, like a teacher or school counselor. You can call or text Childhelp at 1-800-422-4453 anytime. If you are in danger right now, call 911.';

/** Held for care or safety: calm, never confetti. */
export function isCareHold(review: string | null | undefined): boolean {
  return review === 'care' || review === 'safety';
}

/** Same as SafeText::isAimedAtOthers: self-harm words aimed at someone else ("go unalive urself"). */
const MEAN_PHRASES = compile(RULES.mean_phrases);
export function isAimedAtOthers(text: string): boolean {
  if (!text.trim()) return false;
  const words = wordForm(text);
  if (/\b(kys|go\s+die|go\s+jump\s+off)\b/u.test(words)) return true;
  return /\b(u|you|ur|your|urself|yourself|ya|yall)\b/u.test(words) && matchesAny(MEAN_PHRASES, forms(text));
}

/** Care-matching text (narrow or wide, about the author): never blocked in the app. */
export function isCare(text: string): boolean {
  return (isDistress(text) || isCareCheck(text)) && !isAimedAtOthers(text);
}

export const CARE_LINE = "It sounds like you're having a hard time. You matter. Please talk to a grown-up you trust, like a parent or teacher. If you feel unsafe right now, call or text 988.";

/** Same as SafeText::needsReview: "u" plus a personal topic. The server holds it; the app does not block. */
export function needsReview(text: string): boolean {
  if (!text.trim()) return false;
  let lower = text.toLowerCase();
  for (const themed of RULES.themed_streets) lower = lower.split(themed).join(' park ');
  lower = lower.replace(/\b(ur|your)\s+(pics?|photos?|selfies?|videos?|vids?)\b/gu, ' post ');
  // Park talk that only looks personal: "what age can you ride", "been to the Star Wars hotel".
  // Only the topic noun inside the phrase becomes "park": the you-word stays.
  for (const exempt of REVIEW_EXEMPT) lower = lower.replace(exempt, (m) => m.replace(REVIEW_EXEMPT_NOUNS, 'park'));
  const all = forms(lower);
  return all.some((f) => REVIEW_YOU.test(f) && REVIEW_TOPICS.test(f)) || matchesAny(REVIEW_PHRASES, all);
}

/**
 * The cheap check for the keystroke path (POST enabled, send button): empty or too long.
 * The full filter runs on the debounced text and again on submit.
 */
export function quickDraftProblem(text: string, max = POST_MAX): 'empty' | 'too_long' | null {
  const trimmed = text.trim();
  if (!trimmed) return 'empty';
  return trimmed.length > max ? 'too_long' : null;
}

export function checkDraft(text: string, max = POST_MAX): DraftProblem | null {
  const trimmed = text.trim();
  if (!trimmed) return 'empty';
  if (trimmed.length > max) return 'too_long';
  // Disclosure and care first, like the server: a kid telling us someone hurts them, or self-harm
  // words about the author, are never stopped here, even with a phone number, insults or "secret"
  // in them. The server holds them for a grown-up and alerts at once.
  if (isDisclosure(trimmed) || isCare(trimmed)) return null;
  if (hasContactDetails(trimmed)) return 'personal_info';
  if (isGrooming(trimmed)) return 'grooming';
  if (hasPersonalInfo(trimmed)) return 'personal_info';
  if (hasLink(trimmed)) return 'link';
  return null;
}

/** First line, the way the server titles a post (old clients still send it). */
export function titleFrom(text: string): string {
  const first = text.trim().split('\n')[0].trim() || text.trim();
  return first.length > 140 ? `${first.slice(0, 137)}...` : first;
}

/** Kid line when posting is paused (also what the server says). */
export function pauseLine(until: string | null, now = Date.now()): string {
  if (!until) return "You're taking a break from posting.";
  const hours = Math.max(1, Math.ceil((Date.parse(until) - now) / 3_600_000));
  return `You're taking a break from posting. Try again in ${hours} hours.`;
}

/**
 * Only empty or too-long text stops in the app. Everything else goes to the server, which
 * refuses it with the same line and records it for a grown-up (no refusal is ever silent).
 */
export function blocksSend(problem: DraftProblem | null): boolean {
  return problem === 'empty' || problem === 'too_long';
}

/**
 * Old path, unused by the screens since R12 (the server records every refusal itself).
 * Report a blocked draft once per distinct text (tapping POST again on the same
 * words is not a new attempt). Returns the pause line when posting is now paused.
 */
export async function reportBlockedDraft(
  problem: DraftProblem | null,
  text: string,
  lastReported: { current: string | null },
  send: (code: 'personal_info' | 'grooming') => Promise<{ paused: boolean; paused_until: string | null }>,
): Promise<string | null> {
  if (problem !== 'personal_info' && problem !== 'grooming') return null;
  if (!countsTowardPause(text)) return null;
  const key = `${problem}:${text.trim()}`;
  if (lastReported.current === key) return null;
  lastReported.current = key;
  try {
    const result = await send(problem);
    return result.paused ? pauseLine(result.paused_until) : null;
  } catch {
    return null;
  }
}

/** The live hint waits until typing pauses (~250 ms); submit always runs the full check. */
export const HINT_DEBOUNCE_MS = 250;

export const REVIEW_LINE = "Posting... we're giving it a quick look.";

/** The line under a held post or reply, for its author. */
export function reviewLine(review: string | null | undefined): string | null {
  if (review === 'safety') return DISCLOSURE_LINE;
  if (review === 'care') return CARE_LINE;
  if (review === 'person') return PERSON_LINE;
  return review === 'pending' ? REVIEW_LINE : null;
}

/** A hold only a person can clear: never "quick look". */
export const PERSON_LINE = 'A grown-up from Theme Park Shark will check this soon.';

// ── Time ────────────────────────────────────────────────────────────────

/**
 * "just now", "5m", "3h", "2d", then "Sep 30". A server clock ahead of the
 * phone used to read "in 36 minutes ago"; anything in the future is "just now".
 */
export function timeAgo(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const seconds = Math.max(0, Math.round((now - then) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const date = new Date(then);
  return `${months[date.getMonth()]} ${date.getDate()}`;
}

/** Spoken form for VoiceOver ("5 minutes ago"). */
export function timeAgoSpoken(iso: string | null | undefined, now = Date.now()): string {
  const short = timeAgo(iso, now);
  const match = /^(\d+)([mhd])$/.exec(short);
  if (!match) return short;
  const unit = { m: 'minute', h: 'hour', d: 'day' }[match[2] as 'm' | 'h' | 'd'];
  return `${match[1]} ${unit}${match[1] === '1' ? '' : 's'} ago`;
}

export function shortCount(n: number | null | undefined): string {
  const value = Math.max(0, Number(n) || 0);
  if (value < 1000) return String(value);
  if (value < 10000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return `${Math.round(value / 1000)}k`;
}

// ── Reactions (optimistic) ──────────────────────────────────────────────

export interface ReactionCount {
  readonly reaction_type_id: number;
  readonly count: number;
}

export interface ReactionState {
  readonly counts: readonly ReactionCount[];
  readonly mine: number | null;
  readonly total: number;
}

/** Tap a face: same face again removes it, another face moves my reaction. */
export function toggleReaction(state: ReactionState, typeId: number): ReactionState {
  const counts = new Map(state.counts.map((row) => [row.reaction_type_id, row.count]));
  const bump = (id: number, by: number) => counts.set(id, Math.max(0, (counts.get(id) ?? 0) + by));
  let total = state.total;
  let mine: number | null;

  if (state.mine === typeId) {
    bump(typeId, -1);
    total -= 1;
    mine = null;
  } else {
    if (state.mine !== null) bump(state.mine, -1);
    else total += 1;
    bump(typeId, 1);
    mine = typeId;
  }

  return {
    counts: [...counts.entries()].filter(([, count]) => count > 0).map(([reaction_type_id, count]) => ({ reaction_type_id, count })),
    mine,
    total: Math.max(0, total),
  };
}

export function countFor(state: ReactionState, typeId: number): number {
  return state.counts.find((row) => row.reaction_type_id === typeId)?.count ?? 0;
}

// ── Errors ──────────────────────────────────────────────────────────────

interface ErrorLike {
  readonly response?: { readonly status?: number; readonly data?: { readonly message?: string; readonly errors?: Record<string, string[]> } };
  readonly message?: string;
}

/**
 * One kid line for any failed post or reply. Server lines (filter, rate
 * limit, suspension) are already kid-readable; raw Laravel text never shows.
 */
export function errorLine(error: unknown): string {
  const e = (error ?? {}) as ErrorLike;
  const status = e.response?.status;
  const data = e.response?.data;
  if (!e.response) return "No signal right now. Your words are saved, try again.";
  const fieldLine = data?.errors?.content?.[0] ?? data?.errors?.title?.[0] ?? data?.errors?.comment_id?.[0];
  if (fieldLine && !/field|must be|validation/i.test(fieldLine)) return fieldLine;
  if ((status === 403 || status === 429 || status === 422) && data?.message && !/field|must be|server error|unauthenticated|this action/i.test(data.message)) {
    return data.message;
  }
  if (status === 404) return 'This post is gone.';
  if (status === 401) return 'Sign in to post.';
  return "Something went wrong. Your words are saved, try again.";
}

// ── Paging ──────────────────────────────────────────────────────────────

export interface Page<T> {
  readonly data: T[];
  readonly hasMore: boolean;
}

/** Append a page without duplicates (a new post can shift items between pages). */
export function mergePage<T extends { id: number }>(current: readonly T[], next: readonly T[], page: number): T[] {
  if (page <= 1) return [...next];
  const seen = new Set(current.map((item) => item.id));
  return [...current, ...next.filter((item) => !seen.has(item.id))];
}
