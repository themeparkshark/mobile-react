/**
 * Shark Social: pure rules shared by the feed, the post screen and the
 * composer. No React here so the tests can run every rule directly.
 */

import RULES from './safetextRules.json';

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
export const QUICK_REPLIES = ['So cool!', 'Same!', 'I want to go!', 'Love it!', 'Congrats!', 'Trade?'] as const;
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

export const DRAFT_LINES: Readonly<Record<DraftProblem, string>> = {
  empty: 'Write something first!',
  too_long: 'That is a lot of words! Try a shorter post.',
  personal_info: "Stay safe! Don't share phone numbers, addresses, emails or other apps.",
  grooming: "Let's keep it about parks. Don't ask people their age, school, or where they are.",
  link: "Links can't be posted here.",
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
  return out !== undefined && out.length >= 2 ? out : null;
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
  let base = input.replace(/(?<![\d:])(\d{1,2}):(\d{2})(?![\d:])/gu, (m, h, mm) => (Number(h) <= 23 && Number(mm) <= 59 ? ' clock ' : m));
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
  const cue = PHONE_CUES.some((word) => new RegExp(`\\b${escapeRe(word)}\\b`, 'u').test(base));
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

export function checkDraft(text: string, max = POST_MAX): DraftProblem | null {
  const trimmed = text.trim();
  if (!trimmed) return 'empty';
  if (trimmed.length > max) return 'too_long';
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
