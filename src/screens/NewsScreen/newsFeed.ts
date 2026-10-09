/**
 * News v2 data: saved copy first, then the game server, then WordPress.
 *
 * - First paint comes from the copy saved on the phone (instant, works offline).
 * - Page 1 of Top Stories comes from the game server's cached feed (/news),
 *   which answers in well under a second even when WordPress takes 45 s.
 * - Paging, park filters and search use the server when it says it can
 *   (meta.version >= 2, backend branch claude/fb-news-be); today's live
 *   server cannot, so the app asks WordPress directly with a short timeout and
 *   keeps everything it already has on screen if WordPress is slow.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import client from '../../api/client';
import {
  entriesFromServer,
  entryFromWordPress,
  filterByKey,
  mergeEntries,
  type NewsEntry,
  type NewsFilterKey,
} from './newsModel';

export const WP_POSTS = 'https://themeparkshark.com/wp-json/wp/v2/posts';
export const PAGE_SIZE = 20;
/** WordPress gets this long before the screen says "still loading" and keeps what it has. */
export const WP_TIMEOUT_MS = 15000;

const FEED_KEY = 'tps.news.v2.feed';
const READ_KEY = 'tps.news.v2.read';
const SAVED_MAX = 30;
const READ_MAX = 400;

const WP_FIELDS = 'id,date_gmt,title,link,excerpt,content,categories,_links,_embedded';

export type NewsQuery = {
  readonly filter: NewsFilterKey;
  readonly park?: string | null;
  readonly search?: string;
  readonly page: number;
};

export type NewsPage = {
  readonly entries: NewsEntry[];
  readonly hasMore: boolean;
  readonly source: 'server' | 'wordpress';
};

/** Dev only: EXPO_PUBLIC_NEWS_OFFLINE=1 makes every news request fail, to record the offline states. */
const DEV_OFFLINE = __DEV__ && process.env.EXPO_PUBLIC_NEWS_OFFLINE === '1';
function devOffline(): void {
  if (DEV_OFFLINE) throw new Error('offline (dev flag)');
}

/** Remembered for the session: does the game server page and filter (v2)? */
let serverV2: boolean | null = null;
export function serverPages(): boolean | null {
  return serverV2;
}

/* -------------------------------------------------------------- saved */

export async function loadSaved(): Promise<NewsEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(FEED_KEY);
    const list = raw ? JSON.parse(raw) : null;
    return Array.isArray(list) ? mergeEntries(list) : [];
  } catch {
    return [];
  }
}

export function saveFeed(entries: readonly NewsEntry[]): void {
  try {
    AsyncStorage.setItem(FEED_KEY, JSON.stringify(entries.slice(0, SAVED_MAX))).catch(() => undefined);
  } catch {
    // Storage full or unavailable: the next visit just loads from the network.
  }
}

export async function loadReadIds(): Promise<Set<number>> {
  try {
    const raw = await AsyncStorage.getItem(READ_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.filter((n: unknown) => typeof n === 'number') : []);
  } catch {
    return new Set();
  }
}

export function saveReadIds(ids: ReadonlySet<number>): void {
  const list = [...ids].slice(-READ_MAX);
  AsyncStorage.setItem(READ_KEY, JSON.stringify(list)).catch(() => undefined);
}

/* ------------------------------------------------------------ network */

function wpCategoryIds(query: NewsQuery): number[] {
  if (query.filter === 'all') return [];
  const filter = filterByKey(query.filter);
  const park = query.park ? filter.parks.find(p => p.key === query.park) : null;
  return [...(park ? park.ids : filter.ids)];
}

async function fromWordPress(query: NewsQuery): Promise<NewsPage> {
  devOffline();
  const categories = wpCategoryIds(query);
  const response = await axios.get(WP_POSTS, {
    timeout: WP_TIMEOUT_MS,
    params: {
      per_page: PAGE_SIZE,
      page: query.page,
      _embed: 'wp:featuredmedia',
      _fields: WP_FIELDS,
      ...(categories.length ? { categories: categories.join(',') } : {}),
      ...(query.search ? { search: query.search } : {}),
    },
  });
  const list = Array.isArray(response.data) ? response.data : [];
  const entries = list.map(entryFromWordPress).filter((e: NewsEntry | null): e is NewsEntry => !!e);
  const totalPages = Number(response.headers?.['x-wp-totalpages']);
  const hasMore = Number.isFinite(totalPages) ? query.page < totalPages : entries.length >= PAGE_SIZE;
  return { entries, hasMore, source: 'wordpress' };
}

async function fromServer(query: NewsQuery): Promise<NewsPage> {
  devOffline();
  const plain = query.filter === 'all' && !query.search && query.page === 1;
  const response = await client.get('/news', {
    params: plain ? undefined : {
      page: query.page,
      ...(query.filter !== 'all' ? { filter: query.filter } : {}),
      ...(query.park ? { park: query.park } : {}),
      ...(query.search ? { search: query.search } : {}),
    },
  });
  const { entries, v2, hasMore } = entriesFromServer(response.data);
  serverV2 = v2;
  // A v1 server ignores paging and filters: its list is only Top Stories page 1.
  if (!v2 && !plain) throw new Error('server cannot page');
  if (!entries.length && plain) throw new Error('empty feed');
  return { entries, hasMore: v2 ? Boolean(hasMore) : true, source: 'server' };
}

/**
 * One page of stories. The game server first when it can answer this query,
 * WordPress otherwise (or when the server fails).
 */
export async function fetchNewsPage(query: NewsQuery): Promise<NewsPage> {
  const plain = query.filter === 'all' && !query.search && query.page === 1;
  if (plain || serverV2) {
    try {
      return await fromServer(query);
    } catch {
      // Fall through to WordPress.
    }
  }
  return fromWordPress(query);
}

/**
 * The live v1 server sends no categories. One small WordPress call (ids and
 * categories only) fills them in so park tags and filters are exact; if it
 * fails the title words still place most stories.
 */
export async function fetchCategories(ids: readonly number[]): Promise<Map<number, number[]>> {
  devOffline();
  const out = new Map<number, number[]>();
  if (!ids.length) return out;
  const response = await axios.get(WP_POSTS, {
    timeout: WP_TIMEOUT_MS,
    params: { include: ids.slice(0, 100).join(','), per_page: Math.min(100, ids.length), _fields: 'id,categories' },
  });
  for (const post of Array.isArray(response.data) ? response.data : []) {
    if (typeof post?.id === 'number' && Array.isArray(post.categories)) out.set(post.id, post.categories);
  }
  return out;
}

/** A themeparkshark.com article by its slug, for links inside a story. */
export async function fetchBySlug(slug: string): Promise<NewsEntry | null> {
  const response = await axios.get(WP_POSTS, {
    timeout: WP_TIMEOUT_MS,
    params: { slug, _embed: 'wp:featuredmedia', _fields: WP_FIELDS },
  });
  const post = Array.isArray(response.data) ? response.data[0] : null;
  return entryFromWordPress(post);
}

/* --------------------------------------------------- reader hand-off */

/**
 * Stories the reader can show, by id. Route params carry only ids (articles
 * hold their full HTML), and this cache only grows within a session, so an
 * older reader in the stack never loses its list.
 */
const entryCache = new Map<number, NewsEntry>();
export function rememberEntries(list: readonly NewsEntry[]): void {
  for (const entry of list) {
    const prev = entryCache.get(entry.id);
    entryCache.set(entry.id, prev ? mergeEntries([prev], [entry])[0] : entry);
  }
}
export function getEntry(id: number): NewsEntry | undefined {
  return entryCache.get(id);
}
export function findBySlug(slug: string): NewsEntry | undefined {
  for (const entry of entryCache.values()) {
    if (entry.url && entry.url.toLowerCase().includes(`/${slug}/`)) return entry;
  }
  return undefined;
}

/**
 * The story the reader is showing. The feed (still mounted under the reader)
 * follows along, so going back lands on that story with no jump.
 */
let lastViewed: number | null = null;
const viewedListeners = new Set<(id: number) => void>();
export function setLastViewed(id: number | null): void {
  lastViewed = id;
  if (id != null) viewedListeners.forEach(listener => listener(id));
}
export function takeLastViewed(): number | null {
  const id = lastViewed;
  lastViewed = null;
  return id;
}
export function onLastViewed(listener: (id: number) => void): () => void {
  viewedListeners.add(listener);
  return () => { viewedListeners.delete(listener); };
}

/* ------------------------------------------------------- read stories */

let readSet: Set<number> | null = null;
let readLoad: Promise<Set<number>> | null = null;

/** Stories opened on this phone (loaded once, then kept in memory). */
export function readStories(): Promise<Set<number>> {
  if (readSet) return Promise.resolve(readSet);
  readLoad ??= loadReadIds().then(ids => (readSet = ids));
  return readLoad;
}

export function readNow(): ReadonlySet<number> {
  return readSet ?? new Set();
}

export function markRead(id: number): void {
  if (!readSet) readSet = new Set();
  if (readSet.has(id)) return;
  readSet.add(id);
  saveReadIds(readSet);
}
