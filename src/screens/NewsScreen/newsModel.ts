/**
 * News v2: pure helpers for the News tab and the story reader (no React, no
 * network). Everything here is unit tested in tools/tests/news-model.test.cjs.
 *
 * Stories come from three places that all end up in the same NewsEntry shape:
 * the game server's cached feed (/news, v1 today, v2 adds categories and
 * paging), WordPress itself (themeparkshark.com/wp-json/wp/v2/posts) when the
 * server cannot page or filter yet, and the copy saved on the phone.
 */
import type { EntryType } from '../../models/entry-type';

export type NewsEntry = EntryType & {
  /** WordPress category ids, when the source sent them. */
  readonly categories?: readonly number[];
  readonly image_width?: number | null;
  readonly image_height?: number | null;
  readonly image_credit?: string | null;
  readonly read_minutes?: number | null;
};

/* ------------------------------------------------------------------ dates */

/**
 * Milliseconds for a feed date. WordPress `date_gmt` has no zone suffix
 * ("2026-10-09T01:05:27"), so a bare date is UTC, never phone-local time.
 */
export function newsTime(date: string | null | undefined): number {
  if (!date) return NaN;
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(date) ? date : `${date.replace(' ', 'T')}Z`;
  return Date.parse(iso);
}

/** Short, kid-readable age: "Just now", "12 min ago", "3 hr ago", "Yesterday", "Oct 2". */
export function timeAgo(date: string | null | undefined, now: number = Date.now()): string {
  const ms = newsTime(date);
  if (!Number.isFinite(ms)) return '';
  const minutes = Math.max(0, Math.floor((now - ms) / 60000));
  if (minutes < 5) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  if (hours < 48) return 'Yesterday';
  return shortDate(ms, now);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function shortDate(ms: number, now: number): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return `${MONTHS[d.getMonth()]} ${d.getDate()}${sameYear ? '' : `, ${d.getFullYear()}`}`;
}

/** Reader date line in the phone's own time zone: "October 8, 2026". */
export function longDate(date: string | null | undefined): string {
  const ms = newsTime(date);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  return `${MONTHS_LONG[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** A story counts as NEW for its first 12 hours (never for a future date). */
export function isFresh(date: string | null | undefined, now: number = Date.now()): boolean {
  const ms = newsTime(date);
  if (!Number.isFinite(ms)) return false;
  const age = now - ms;
  return age >= -10 * 60 * 1000 && age < 12 * 60 * 60 * 1000;
}

/* ----------------------------------------------------- filters and parks */

export type NewsFilterKey = 'all' | 'disney' | 'universal' | 'seaworld' | 'more';

export type NewsPark = {
  readonly key: string;
  readonly label: string;
  /** WordPress category ids that mean this park. */
  readonly ids: readonly number[];
};

export type NewsFilter = {
  readonly key: NewsFilterKey;
  readonly label: string;
  /** Every WordPress category id inside this filter (parent and children). */
  readonly ids: readonly number[];
  /** Park chips shown under the filter once it is picked. */
  readonly parks: readonly NewsPark[];
  /** Title and excerpt words that place a story here when categories are missing. */
  readonly words: RegExp | null;
};

/**
 * themeparkshark.com's category tree (wp/v2/categories, Oct 8 2026). Ids are
 * stable in WordPress; a new child category simply falls back to the parent.
 */
export const NEWS_FILTERS: readonly NewsFilter[] = [
  { key: 'all', label: 'Top Stories', ids: [], parks: [], words: null },
  {
    key: 'disney',
    label: 'Disney',
    ids: [39, 40, 41, 42, 43, 44, 45, 46, 48, 49, 50, 51, 52, 53, 54, 55, 72, 73, 75, 76, 77, 114, 1041],
    parks: [
      { key: 'wdw', label: 'Walt Disney World', ids: [40, 41, 42, 43, 44, 45, 46, 72, 73, 76, 1041] },
      { key: 'dlr', label: 'Disneyland', ids: [48, 49, 50, 51, 75, 77] },
      { key: 'dlp', label: 'Paris', ids: [52] },
      { key: 'asia', label: 'Tokyo and Asia', ids: [53, 54, 55] },
    ],
    words: /\b(disney|disneyland|epcot|magic kingdom|hollywood studios|animal kingdom|pixar|marvel|star wars|lucasfilm|galaxy'?s edge|d23|imagineer|mickey|minnie|frozen|encanto)\b/i,
  },
  {
    key: 'universal',
    label: 'Universal',
    ids: [47, 56, 57, 58, 71, 78, 513, 645, 932, 997, 1055],
    parks: [
      { key: 'uor', label: 'Orlando', ids: [56] },
      { key: 'ush', label: 'Hollywood', ids: [57] },
      { key: 'usj', label: 'Japan', ids: [58] },
      { key: 'hhn', label: 'Halloween Horror Nights', ids: [71] },
      { key: 'ukr', label: 'Kids Resort', ids: [932] },
    ],
    words: /\b(universal|epic universe|citywalk|halloween horror nights|hhn|nintendo|minions?|illumination|islands of adventure|volcano bay|wizarding world|hogwarts)\b/i,
  },
  {
    key: 'seaworld',
    label: 'SeaWorld',
    ids: [59, 60, 68, 69, 70, 74, 1639],
    parks: [],
    words: /\b(seaworld|busch gardens|aquatica|discovery cove|sesame place|adventure island|howl-o-scream)\b/i,
  },
  {
    key: 'more',
    label: 'More Parks',
    ids: [61, 63, 64, 65, 66, 67, 120],
    parks: [],
    words: /\b(six flags|cedar point|legoland|knott'?s|dollywood|hersheypark|holiday world|kings island|carowinds|silver dollar city|kennywood|europa-park|efteling)\b/i,
  },
];

export function filterByKey(key: NewsFilterKey): NewsFilter {
  return NEWS_FILTERS.find(f => f.key === key) ?? NEWS_FILTERS[0];
}

/** Most specific park name for the small tag on a card, from the category ids. */
const PARK_LABELS: Readonly<Record<number, string>> = {
  41: 'Magic Kingdom', 42: 'EPCOT', 43: 'Animal Kingdom', 44: 'Hollywood Studios', 46: 'Disney Springs',
  45: 'Walt Disney World', 1041: 'Walt Disney World', 76: 'Walt Disney World', 72: 'Walt Disney World', 73: 'Walt Disney World',
  40: 'Walt Disney World', 49: 'Disneyland', 50: 'California Adventure', 51: 'Downtown Disney', 75: 'Disneyland', 77: 'Disneyland',
  48: 'Disneyland Resort', 52: 'Disneyland Paris', 53: 'Hong Kong Disneyland', 54: 'Tokyo Disney Resort', 55: 'Shanghai Disney',
  114: 'Disney', 39: 'Disney',
  71: 'Horror Nights', 997: 'Universal', 513: 'Universal', 56: 'Universal Orlando', 57: 'Universal Hollywood', 58: 'Universal Japan',
  932: 'Universal Kids Resort', 645: 'Universal Singapore', 1055: 'Universal', 78: 'Universal', 47: 'Universal',
  68: 'Aquatica', 69: 'Discovery Cove', 1639: 'Sesame Place', 59: 'SeaWorld', 70: 'Busch Gardens', 74: 'Busch Gardens', 60: 'Busch Gardens',
  64: 'Legoland', 65: "Knott's", 66: 'Hersheypark', 63: 'Dollywood', 67: 'Wild Adventures', 61: 'More Parks', 120: 'More Parks',
};
/** Specific parks win over resorts, resorts over brands. */
const LABEL_ORDER = [41, 42, 43, 44, 46, 49, 50, 51, 71, 932, 1639, 68, 69, 64, 65, 66, 63, 67, 52, 53, 54, 55, 56, 57, 58, 645, 40, 45, 1041, 76, 72, 73, 48, 75, 77, 59, 60, 70, 74, 114, 997, 513, 1055, 78, 61, 120, 39, 47];

export function filterOf(entry: NewsEntry): NewsFilterKey | null {
  if (entry.categories && entry.categories.length) {
    for (const filter of NEWS_FILTERS) {
      if (filter.key !== 'all' && entry.categories.some(id => filter.ids.includes(id))) return filter.key;
    }
    return null;
  }
  const text = `${plainText(entry.title)} ${plainText(entry.excerpt ?? '').slice(0, 280)}`;
  for (const filter of NEWS_FILTERS) {
    if (filter.words && filter.words.test(text)) return filter.key;
  }
  return null;
}

/** The small tag on a card ("EPCOT", "Universal Hollywood"); null when unknown. */
export function parkLabel(entry: NewsEntry): string | null {
  if (entry.categories && entry.categories.length) {
    for (const id of LABEL_ORDER) if (entry.categories.includes(id)) return PARK_LABELS[id];
  }
  const key = filterOf(entry);
  return key ? filterByKey(key).label : null;
}

export function matchesFilter(entry: NewsEntry, filter: NewsFilterKey, park: string | null = null): boolean {
  if (filter === 'all') return true;
  const f = filterByKey(filter);
  if (park) {
    const p = f.parks.find(x => x.key === park);
    if (!p) return filterOf(entry) === filter;
    // Without categories a park chip cannot be told apart, so fall back to the brand.
    return entry.categories && entry.categories.length
      ? entry.categories.some(id => p.ids.includes(id))
      : filterOf(entry) === filter;
  }
  return filterOf(entry) === filter;
}

/* ---------------------------------------------------------------- text */

const ENTITIES: Readonly<Record<string, string>> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', hellip: '...', ndash: '-', mdash: '-',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', eacute: 'é',
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

export function plainText(html: string | null | undefined): string {
  if (!html) return '';
  return decodeEntities(String(html).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

/** Photo credit lines that WordPress folds into excerpts ("Image courtesy of ...", "Photo: Disney"). */
const CREDIT = /^(?:(?:photo|image|images|video)s?(?: courtesy)?(?: of)?:?|courtesy of)\s/i;

/**
 * One or two sentence dek for a card: the story's first real paragraph
 * (never a photo credit), else the WordPress excerpt.
 */
export function dek(entry: NewsEntry, max = 150): string {
  let text = '';
  for (const m of String(entry.content ?? '').matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const para = plainText(m[1]);
    if (para.length > 30 && !CREDIT.test(para)) { text = para; break; }
  }
  if (!text) {
    text = plainText(entry.excerpt ?? '').replace(/\[(?:&hellip;|\.\.\.|\u2026)\]$/, '').trim();
    while (CREDIT.test(text)) {
      const next = text.search(/(?<=[a-z.)])\s+(?=[A-Z][a-z]+ )/);
      text = next > 0 ? text.slice(next).trim() : '';
      if (!CREDIT.test(text)) break;
    }
  }
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sentence = cut.lastIndexOf('. ');
  if (sentence > max * 0.5) return cut.slice(0, sentence + 1);
  return `${cut.slice(0, cut.lastIndexOf(' '))}...`;
}

export function readMinutes(entry: NewsEntry): number {
  if (entry.read_minutes && entry.read_minutes > 0) return entry.read_minutes;
  const words = plainText(entry.content ?? '').split(' ').filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/* -------------------------------------------------------------- images */

/** Width / height of the featured image: sent sizes, then the WordPress "-768x432" file name, else 16:9. */
export function imageAspect(entry: NewsEntry): number {
  const w = Number(entry.image_width);
  const h = Number(entry.image_height);
  if (w > 0 && h > 0) return clampAspect(w / h);
  for (const url of [entry.featured_image, entry.featured_image_full]) {
    const m = url ? /-(\d{2,5})x(\d{2,5})\.(?:jpe?g|png|webp|gif)(?:\?|$)/i.exec(url) : null;
    if (m) return clampAspect(Number(m[1]) / Number(m[2]));
  }
  return 16 / 9;
}

/** Keep odd uploads readable: no taller than 4:5, no wider than 2.4:1. */
export function clampAspect(ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return 16 / 9;
  return Math.min(2.4, Math.max(0.8, ratio));
}

/* ---------------------------------------------------- article HTML prep */

export function youTubeId(src: string): string | null {
  const m = /youtube(?:-nocookie)?\.com\/(?:embed|shorts)\/([A-Za-z0-9_-]{6,20})|youtu\.be\/([A-Za-z0-9_-]{6,20})/.exec(src);
  return m ? m[1] ?? m[2] : null;
}

/**
 * Cleans WordPress article HTML for the in-app reader:
 * - scripts, styles and HTML comments go;
 * - X/Twitter embeds (only a "View post on X" link without their script) go;
 * - YouTube embeds become <tpsvideo> tags the reader draws as a tap-to-play card;
 * - other iframes go (they cannot play in a kids reader);
 * - empty paragraphs go.
 */
export function prepareArticleHtml(html: string | null | undefined): string {
  if (!html) return '';
  let out = String(html)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  out = out.replace(/<figure[^>]*>(?:(?!<\/figure>)[\s\S])*?twitter-tweet[\s\S]*?<\/figure>/gi, '');
  out = out.replace(/<blockquote[^>]*twitter-tweet[\s\S]*?<\/blockquote>/gi, '');
  out = out.replace(/<iframe([^>]*)>[\s\S]*?<\/iframe>|<iframe([^>]*)\/?>/gi, (_m, a = '', b = '') => {
    const attrs = `${a}${b}`;
    const src = /src="([^"]+)"/i.exec(attrs)?.[1] ?? '';
    const id = youTubeId(src);
    if (!id) return '';
    const title = /title="([^"]*)"/i.exec(attrs)?.[1] ?? '';
    const tall = Number(/height="(\d+)"/i.exec(attrs)?.[1] ?? 0) > Number(/width="(\d+)"/i.exec(attrs)?.[1] ?? 1);
    return `<tpsvideo data-id="${id}" data-title="${title.replace(/"/g, '&quot;')}" data-short="${tall || /#shorts/i.test(title) ? '1' : '0'}"></tpsvideo>`;
  });
  out = out.replace(/<p>\s*(?:&nbsp;| )?\s*<\/p>/gi, '');
  // Empty embed shells left behind.
  out = out.replace(/<figure[^>]*>\s*(?:<div[^>]*>\s*<\/div>\s*)?<\/figure>/gi, '');
  return out.trim();
}

/**
 * A themeparkshark.com article link ("/2026/08/06/<slug>/") opens in the
 * reader; anything else (pages, other sites) goes through the grown-up gate.
 */
export function tpsArticleSlug(url: string | null | undefined): string | null {
  if (!url) return null;
  const m = /^https?:\/\/(?:www\.)?themeparkshark\.com\/\d{4}\/\d{2}\/\d{2}\/([a-z0-9-]+)\/?(?:[?#].*)?$/i.exec(url.trim());
  return m ? m[1].toLowerCase() : null;
}

export function isTpsUrl(url: string | null | undefined): boolean {
  return !!url && /^https?:\/\/(?:www\.)?themeparkshark\.com(?:\/|$)/i.test(url.trim());
}

/* ---------------------------------------------------- lists and paging */

/** Newest first, one copy per id; a later copy with more fields wins. */
export function mergeEntries(...lists: readonly (readonly NewsEntry[])[]): NewsEntry[] {
  const byId = new Map<number, NewsEntry>();
  for (const list of lists) {
    for (const entry of list) {
      if (!entry || typeof entry.id !== 'number') continue;
      const prev = byId.get(entry.id);
      byId.set(entry.id, prev ? { ...prev, ...stripEmpty(entry) } : entry);
    }
  }
  return [...byId.values()].sort((a, b) => (newsTime(b.date) || 0) - (newsTime(a.date) || 0));
}

function stripEmpty(entry: NewsEntry): NewsEntry {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entry)) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0)) continue;
    out[k] = v;
  }
  return out as unknown as NewsEntry;
}

/** Up to `n` other stories from the same park family, newest first, then any others. */
export function relatedFor(entry: NewsEntry, list: readonly NewsEntry[], n = 3): NewsEntry[] {
  const key = filterOf(entry);
  const others = list.filter(e => e.id !== entry.id);
  const same = key ? others.filter(e => filterOf(e) === key) : [];
  const rest = others.filter(e => !same.includes(e));
  return [...same, ...rest].slice(0, n);
}

/** Local search over loaded stories: every word must appear in the title or dek. */
export function searchLocal(list: readonly NewsEntry[], query: string): NewsEntry[] {
  const words = query.toLowerCase().split(/\s+/).map(w => w.replace(/[^a-z0-9']/g, '')).filter(w => w.length > 1);
  if (!words.length) return [];
  return list.filter(e => {
    const hay = `${plainText(e.title)} ${plainText(e.excerpt ?? '')}`.toLowerCase();
    return words.every(w => hay.includes(w));
  });
}

/* --------------------------------------------------- WordPress mapping */

/** One wp/v2/posts item (with _embed=wp:featuredmedia) in the app's shape. */
export function entryFromWordPress(post: any): NewsEntry | null {
  if (!post || typeof post.id !== 'number') return null;
  const media = post._embedded?.['wp:featuredmedia']?.[0] ?? {};
  const sizes = media?.media_details?.sizes ?? {};
  const sized = sizes.medium_large ?? sizes.large ?? sizes.medium ?? null;
  const width = Number(sized?.width ?? media?.media_details?.width) || null;
  const height = Number(sized?.height ?? media?.media_details?.height) || null;
  return {
    id: post.id,
    date: post.date_gmt ?? post.date ?? '',
    featured_image: sized?.source_url ?? media?.source_url ?? null,
    featured_image_full: sizes.large?.source_url ?? media?.source_url ?? null,
    title: post.title?.rendered ?? '',
    url: post.link ?? '',
    content: post.content?.rendered ?? '',
    excerpt: post.excerpt?.rendered ?? '',
    categories: Array.isArray(post.categories) ? post.categories.filter((n: unknown) => typeof n === 'number') : undefined,
    image_width: width,
    image_height: height,
    image_credit: plainText(media?.caption?.rendered ?? '') || null,
  };
}

/** Accepts the server feed (v1 or v2) and keeps only well-formed stories. */
export function entriesFromServer(body: unknown): { entries: NewsEntry[]; v2: boolean; hasMore: boolean | null } {
  const data = (body as { data?: unknown })?.data;
  const meta = (body as { meta?: { version?: number; has_more?: boolean } })?.meta;
  const entries = Array.isArray(data)
    ? (data as NewsEntry[]).filter(e => e && typeof e.id === 'number' && typeof e.title === 'string')
    : [];
  const v2 = Number(meta?.version) >= 2;
  return { entries, v2, hasMore: v2 ? Boolean(meta?.has_more) : null };
}
