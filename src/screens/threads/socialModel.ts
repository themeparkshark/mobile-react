/**
 * Shark Social: pure rules shared by the feed, the post screen and the
 * composer. No React here so the tests can run every rule directly.
 */

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

export type DraftProblem = 'empty' | 'too_long' | 'personal_info' | 'link';

export const DRAFT_LINES: Readonly<Record<DraftProblem, string>> = {
  empty: 'Write something first!',
  too_long: 'That is a lot of words! Try a shorter post.',
  personal_info: "Stay safe! Don't share phone numbers, addresses, emails or other apps.",
  link: "Links can't be posted here.",
};

/*
 * A port of the server's SafeText personal-info and link checks (same
 * normalising, same patterns), so a kid sees the reason before posting. The
 * server stays the gate; tools/tests/fixtures/safetext_cases.json is shared.
 */
const CONFUSABLES: Record<string, string> = {
  'а': 'a', 'е': 'e', 'о': 'o', 'р': 'p', 'с': 'c', 'у': 'y', 'х': 'x', 'і': 'i', 'ј': 'j', 'ѕ': 's', 'к': 'k', 'м': 'm',
  'н': 'h', 'т': 't', 'в': 'b', 'α': 'a', 'ε': 'e', 'ο': 'o', 'ρ': 'p', 'τ': 't', 'υ': 'u', 'ν': 'v', 'κ': 'k', 'ι': 'i',
  'ս': 'u', 'օ': 'o', 'ց': 'g', 'հ': 'h', 'ո': 'n', 'ա': 'w', 'ք': 'p',
};
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'l' };
const NUMBER_WORDS: Record<string, string> = {
  zero: '0', oh: '0', o: '0', one: '1', won: '1', two: '2', to: '2', too: '2', three: '3', four: '4', for: '4',
  five: '5', six: '6', seven: '7', eight: '8', ate: '8', nine: '9',
};
const AMBIGUOUS = new Set(['oh', 'o', 'to', 'too', 'for', 'won', 'ate']);
const CHAT_APPS = 'snap|snapchat|sc|insta|instagram|ig|kik|discord|telegram|whatsapp|whats app|messenger|wechat';
const ALL_APPS = `${CHAT_APPS}|tiktok|tik tok|youtube|yt|twitch|roblox|fortnite|minecraft|xbox|psn|playstation|gamertag|facebook|fb|twitter`;
const HANDLE = '(?=[a-z0-9_.]*[a-z])(?=[a-z0-9_.]*[0-9_])[a-z0-9_.]{4,}';
const THEMED_STREETS = ['main street usa', 'main street u s a', 'main st usa', 'main street', 'hollywood boulevard', 'hollywood blvd',
  'sunset boulevard', 'sunset blvd', 'buena vista street', 'americana street', 'mediterranean harbor'];

function baseForm(text: string): string {
  return [...text.normalize('NFKC').toLowerCase()].map((ch) => CONFUSABLES[ch] ?? ch).join('');
}

function wordForm(text: string, leet = true): string {
  let t = baseForm(text).replace(/[’‘`]/g, "'");
  if (leet) t = t.replace(/[a-z0-9@$!|]*[a-z][a-z0-9@$!|]*/g, (w) => [...w].map((ch) => LEET[ch] ?? ch).join(''));
  t = t.replace(/(?<=\w)[*#%^~]+(?=\w)/g, '').replace(/'/g, '').replace(/[^\p{L}\p{N}\s#/]/gu, ' ');
  t = t.replace(/(\p{L})\1{2,}/gu, '$1$1');
  return t.replace(/\s+/g, ' ').trim();
}

function longestDigitRun(base: string): number {
  const tokens = base.replace(/\b\d{1,3}(,\d{3})+\b/g, ' amount ').split(/[\s.\-()/,_+]+/).filter(Boolean);
  const runs: string[][] = [[]];
  for (const token of tokens) {
    if (/^\d+$/.test(token) || token in NUMBER_WORDS) runs[runs.length - 1].push(token);
    else runs.push([]);
  }
  let best = 0;
  for (const run of runs) {
    const real = run.filter((t) => t in NUMBER_WORDS && !AMBIGUOUS.has(t)).length;
    let length = 0;
    for (const t of run) {
      if (/^\d+$/.test(t)) length += t.length;
      else if (!AMBIGUOUS.has(t) || real >= 2) length += 1;
      else { best = Math.max(best, length); length = 0; }
    }
    best = Math.max(best, length);
  }
  return best;
}

const PERSONAL_PATTERNS: RegExp[] = [
  /\b(my|our)\s+(home\s+)?address\b/, /\bi\s+live\s+(at|on|in|near|by)\b/, /\b(my|our)\s+(phone|cell|number|digits)\b/,
  /\b(call|text|dm|message|facetime|email|snap|hmu|hit\s+me\s+up)\s+me\b/, /\bhmu\b/, /\b(add|follow|friend|find)\s+me\s+on\b/,
  /\b(my|our)\s+(last\s+name|teacher\s?s?\s+name|real\s+name)\b/, /\b(my|our)\s+school\s+(is|name|called)\b/,
  /\bi\s+go\s+to\s+[a-z ]{0,30}\s+(school|elementary|middle|academy)\b/, /\b(zip\s*code|password)\b/, /(^|\s)@[a-z0-9_.]{3,}/,
  new RegExp(`\\b(on|in|my|add|follow|dm|find|me\\s+on)\\s+(${CHAT_APPS})\\b`),
  new RegExp(`\\b(${ALL_APPS})\\s*(:|=|name\\b|handle\\b|username\\b|user\\b|id\\b|code\\b|tag\\b)`),
  new RegExp(`\\b${HANDLE}\\s+(on|in)\\s+(${ALL_APPS})\\b`), new RegExp(`\\b(${ALL_APPS})\\s+${HANDLE}`),
  /\b(insta|instagram|ig|sc|snapchat|kik|discord)\s+[a-z0-9_.]{3,}\s*$/, new RegExp(`\\bmy\\s+(${ALL_APPS})\\s+(is|=|:)`),
  /\b(user\s?name|gamertag|ign|handle|friend\s+code)\s*(is|:|=)?\s*[a-z0-9_.]{3,}/,
  /\bhow\s+old\s+(are|r)\s+(you|u|ya)\b/, /\bwhat\s?s?\s+(is\s+)?(your|ur)\s+age\b/,
  /\b(i\s?m|i\s+am)\s+\d{1,2}\s*(years?\s+old|yrs?\s+old|yo|y\/o)?\s+and\s+i\s+live\b/, /\bwhere\s+(do|d)\s+(you|u|ya)\s+live\b/,
  /\bwhere\s+(are|r)\s+(you|u|ya)\s+(staying|from|at)\b/, /\b(what|which)\s+(hotel|resort|room)\b/, /\b(what|which)\s+(school|grade)\b/,
  /\broom\s*(number|#|no)?\s*\d{2,4}\b/,
  /\bsend\s+(me\s+)?(a\s+|some\s+|ur\s+|your\s+)?(pic|pics|picture|pictures|photo|photos|selfie|selfies|vid|video)\b/,
  /\b(can|could|will)\s+(you|u)\s+send\b/,
  /\b(ur|you\s?re|your|you\s+are|u\s+r|u\s+are)\s+(so\s+|really\s+|very\s+)?(hot|cute|sexy|pretty|beautiful|gorgeous|fine)\b/,
  /\b(be|wanna\s+be|want\s+to\s+be)\s+my\s+(gf|bf|girlfriend|boyfriend|bae)\b/, /\bdate\s+me\b/,
  /\b(video\s+chat|videochat|video\s+call|facetime|face\s+time|private\s+chat|chat\s+privately|call\s+me)\b/,
  /\bdon\s?t\s+tell\s+(your|ur)\s+(mom|dad|parents|mum)\b/, /\bkeep\s+(it|this)\s+(a\s+)?secret\b/,
  /\bmeet\s*-?\s*(me|ups?|you|u)\b/, /\blet\s?s\s+meet\b/, /\bmeet\s+(at|by|near|in\s+front\s+of)\b/, /\bcome\s+find\s+me\b/,
  /\bfind\s+me\s+(at|by|near)\b/, /\b(see|find)\s+(me|you|u)\s+(at|by|near)\s+(\d|the\b)/,
  /\b(i\s?m|i\s+am)\s+(at|by|near)\s+the\s+[a-z ]{2,30}\s+(now|rn|right\s+now)\b/,
];

export function hasPersonalInfo(text: string): boolean {
  const base = baseForm(text);
  if (longestDigitRun(base) >= 7) return true;
  if (/[a-z0-9._%+-]+\s*(@|\(at\)|\[at\])\s*[a-z0-9-]+\s*(\.|\(dot\)|\[dot\])\s*[a-z]{2,}/.test(base)) return true;
  if (/\b[a-z0-9._]{2,}\s+at\s+[a-z0-9-]+\s+dot\s+(com|net|org|edu|co|us)\b/.test(wordForm(text, false))) return true;
  let streets = base;
  for (const themed of THEMED_STREETS) streets = streets.split(themed).join(' park street ');
  streets = streets.replace(/\d+\s+park street/g, ' ');
  if (/\b\d{1,6}\s+([a-z]+\s+){1,2}(street|st|avenue|ave|road|rd|lane|ln|drive|dr|court|ct|boulevard|blvd|circle|terrace|parkway|pkwy)\b\.?(\s|,|$)/.test(streets)) return true;
  const forms = [...new Set([wordForm(text), wordForm(text, false), base])];
  return PERSONAL_PATTERNS.some((pattern) => forms.some((form) => pattern.test(form)));
}

export function hasLink(text: string): boolean {
  return /(https?:\/\/|www\.|\b[a-z0-9-]{2,}\s*\.\s*(com|net|org|io|gg|me|co|tv|ly|app|xyz|link|site|us|uk)\b|\b[a-z0-9-]{2,}\s+dot\s+(com|net|org|io|gg|me|co|tv)\b)/.test(baseForm(text));
}

export function checkDraft(text: string, max = POST_MAX): DraftProblem | null {
  const trimmed = text.trim();
  if (!trimmed) return 'empty';
  if (trimmed.length > max) return 'too_long';
  if (hasPersonalInfo(trimmed)) return 'personal_info';
  if (hasLink(trimmed)) return 'link';
  return null;
}

/** First line, the way the server titles a post (old clients still send it). */
export function titleFrom(text: string): string {
  const first = text.trim().split('\n')[0].trim() || text.trim();
  return first.length > 140 ? `${first.slice(0, 137)}...` : first;
}

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
