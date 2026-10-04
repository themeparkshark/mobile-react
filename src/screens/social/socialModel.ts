/**
 * Social v2 model: pure, tested in tools/tests/social-v2.test.cjs.
 *
 * One vocabulary for every friend surface (bell, Friends, profile):
 *   friends   accepted either way
 *   incoming  they asked me, I have not answered      -> Yes / No
 *   outgoing  I asked, they have not answered         -> "Asked!" (tap to undo)
 *   blocked   I blocked them                          -> Unblock (profile only)
 *   none      nothing between us                      -> Add
 */
import type { GameIconName } from '../../ui/iconNames';

export type FriendStatus = 'friends' | 'incoming' | 'outgoing' | 'blocked' | 'none';

export interface StatusSource {
  readonly id: number;
  readonly friend_status?: FriendStatus | string | null;
  readonly is_friend?: boolean | null;
  readonly has_friend_request_from?: boolean | null;
}

const STATUSES: readonly FriendStatus[] = ['friends', 'incoming', 'outgoing', 'blocked', 'none'];

/** The server's status, else the legacy flags (older servers), else none. */
export function statusOf(player: StatusSource | null | undefined, fallback: FriendStatus = 'none'): FriendStatus {
  if (!player) return fallback;
  const raw = player.friend_status;
  if (typeof raw === 'string' && (STATUSES as readonly string[]).includes(raw)) return raw as FriendStatus;
  if (player.is_friend) return 'friends';
  if (player.has_friend_request_from) return 'incoming';
  return fallback;
}

/** A local override (an answer the player just gave) wins over the payload. */
export function effectiveStatus(player: StatusSource, overrides: ReadonlyMap<number, FriendStatus>, fallback: FriendStatus = 'none'): FriendStatus {
  return overrides.get(player.id) ?? statusOf(player, fallback);
}

export type FriendButtonKind = 'add' | 'asked' | 'friends' | 'answer' | 'blocked';

export interface FriendButtonLook {
  readonly kind: FriendButtonKind;
  /** One short word a 7-year-old can read. */
  readonly label: string;
  readonly icon: GameIconName;
  /** VoiceOver sentence. */
  readonly a11y: (name: string) => string;
}

export function friendButton(status: FriendStatus): FriendButtonLook {
  switch (status) {
    case 'friends':
      return { kind: 'friends', label: 'Friends', icon: 'check', a11y: name => `${name} is your friend` };
    case 'incoming':
      return { kind: 'answer', label: 'Yes!', icon: 'check', a11y: name => `${name} wants to be friends` };
    case 'outgoing':
      return { kind: 'asked', label: 'Asked', icon: 'timer', a11y: name => `You asked ${name}. Tap to take it back` };
    case 'blocked':
      return { kind: 'blocked', label: 'Blocked', icon: 'lock', a11y: name => `You blocked ${name}` };
    default:
      return { kind: 'add', label: 'Add', icon: 'shark', a11y: name => `Add ${name} as a friend` };
  }
}

/** What the status becomes after each answer (used for optimistic UI and its undo). */
export type FriendVerb = 'add' | 'accept' | 'decline' | 'cancel' | 'remove' | 'block' | 'unblock';

export function nextStatus(current: FriendStatus, verb: FriendVerb): FriendStatus {
  switch (verb) {
    case 'add': return current === 'incoming' ? 'friends' : current === 'none' ? 'outgoing' : current;
    case 'accept': return current === 'incoming' ? 'friends' : current;
    case 'decline': return current === 'incoming' ? 'none' : current;
    case 'cancel': return current === 'outgoing' ? 'none' : current;
    case 'remove': return current === 'friends' ? 'none' : current;
    case 'block': return 'blocked';
    case 'unblock': return current === 'blocked' ? 'none' : current;
  }
}

// ---- Notifications --------------------------------------------------------

export type NotificationKind = 'friend_request' | 'friend_accepted' | 'compliment' | 'reply' | 'park_coins' | 'prize' | 'news';

export interface InboxItem {
  readonly id: string;
  readonly kind?: string | null;
  readonly actor_id?: number | null;
  readonly friend_status?: string | null;
  readonly read_at?: string | null;
  readonly created_at: string;
  readonly content?: {
    readonly message?: string | null;
    readonly image?: string | null;
    readonly excerpt?: string | null;
    readonly route?: InboxRoute | null;
  } | null;
}

export interface InboxRoute {
  readonly screen?: string | null;
  readonly params?: Record<string, unknown> | null;
}

const KINDS: readonly NotificationKind[] = ['friend_request', 'friend_accepted', 'compliment', 'reply', 'park_coins', 'prize', 'news'];

/** The server's kind, else read from the stored row (older servers). */
export function kindOf(item: InboxItem): NotificationKind {
  if (item.kind && (KINDS as readonly string[]).includes(item.kind)) return item.kind as NotificationKind;
  const image = item.content?.image ?? '';
  const message = item.content?.message ?? '';
  if (/friend_request_received/.test(image) || /sent you a friend request/i.test(message)) return 'friend_request';
  if (/friend_request_accepted/.test(image) || /accepted your friend request/i.test(message)) return 'friend_accepted';
  if (/compliment/.test(image) || /complimented/i.test(message)) return 'compliment';
  if (/comment_received/.test(image) || /replied to your/i.test(message)) return 'reply';
  if (/park_coin_milestone/.test(image)) return 'park_coins';
  if (/park_completion_prize/.test(image) || /You have earned the/i.test(message)) return 'prize';
  return 'news';
}

export function actorOf(item: InboxItem): number | null {
  if (typeof item.actor_id === 'number') return item.actor_id;
  const kind = kindOf(item);
  if (kind !== 'friend_request' && kind !== 'friend_accepted' && kind !== 'compliment') return null;
  const raw = item.content?.route?.params?.user ?? item.content?.route?.params?.player;
  const id = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export interface KindLook {
  /** Badge fill behind the art. */
  readonly color: string;
  /** Darker shade of the colour (unread stripe, sticker ring). */
  readonly lip: string;
  /** Soft fill of the round badge behind the art. */
  readonly tint: string;
  /** Short tag read by VoiceOver before the message. */
  readonly spoken: string;
}

export const KIND_LOOK: Readonly<Record<NotificationKind, KindLook>> = {
  friend_request: { color: '#8A5CF6', lip: '#5B35B8', tint: '#EFE6FF', spoken: 'Friend request' },
  friend_accepted: { color: '#3CB85C', lip: '#237A3B', tint: '#E3F7E1', spoken: 'New friend' },
  compliment: { color: '#FF8A3D', lip: '#C25A12', tint: '#FFEBDD', spoken: 'Compliment' },
  reply: { color: '#1E9BF0', lip: '#0B5FA0', tint: '#DDF1FF', spoken: 'Reply' },
  park_coins: { color: '#F2B21B', lip: '#B57F00', tint: '#FFF3CF', spoken: 'Park coins' },
  prize: { color: '#EF4A3C', lip: '#B3261B', tint: '#FFE4E1', spoken: 'Prize' },
  news: { color: '#0879CA', lip: '#05468F', tint: '#DDEBFA', spoken: 'News' },
};

/** True while a friend-request row can still be answered right in the bell. */
export function canAnswerInline(item: InboxItem, overrides: ReadonlyMap<number, FriendStatus>): boolean {
  if (kindOf(item) !== 'friend_request') return false;
  const actor = actorOf(item);
  if (actor === null) return false;
  const local = overrides.get(actor);
  if (local) return local === 'incoming';
  // Older servers do not send friend_status: offer the answer only on unread rows.
  if (item.friend_status == null) return !item.read_at;
  return item.friend_status === 'incoming';
}

/** Append a page without duplicates (a row can shift pages when new ones arrive). */
export function mergePage<T extends { readonly id: string | number }>(existing: readonly T[], page: readonly T[]): T[] {
  const seen = new Set(existing.map(item => String(item.id)));
  return [...existing, ...page.filter(item => !seen.has(String(item.id)))];
}

export type InboxRow<T> =
  | { readonly type: 'header'; readonly key: string; readonly label: string; readonly count: number }
  | { readonly type: 'item'; readonly key: string; readonly item: T };

/**
 * Time buckets a kid can trust: Today, This week, Earlier (this year), then one
 * header per older year ("2025"), so a June row under a March row never looks
 * out of order. Each bucket is strictly newest first by created_at. Unread is
 * shown on the row itself, and each header carries how many are still unread.
 */
export function sectionize<T extends InboxItem>(items: readonly T[], readIds: ReadonlySet<string>, now: number = Date.now()): InboxRow<T>[] {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const today = day.getTime();
  const week = today - 6 * 86_400_000;
  const thisYear = day.getFullYear();
  const sorted = [...items].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  const buckets = new Map<string, { label: string; items: T[] }>();
  for (const item of sorted) {
    const at = Date.parse(item.created_at) || 0;
    const year = new Date(at).getFullYear();
    // A missing or bad date can't be placed in a year: it goes to Earlier, never a "1970" section.
    const [key, label] = at === 0 ? ['h-earlier', 'Earlier']
      : at >= today ? ['h-today', 'Today']
      : at >= week ? ['h-week', 'This week']
      : year >= thisYear ? ['h-earlier', 'Earlier']
      : [`h-${year}`, String(year)];
    const bucket = buckets.get(key) ?? { label, items: [] };
    bucket.items.push(item);
    buckets.set(key, bucket);
  }
  // Today, This week, Earlier, then years newest first (a bad-date row can open Earlier after a year bucket).
  const rank = (key: string) => (key === 'h-today' ? 3e4 : key === 'h-week' ? 2e4 : key === 'h-earlier' ? 1e4 : Number(key.slice(2)));
  const rows: InboxRow<T>[] = [];
  for (const [key, bucket] of [...buckets].sort((a, b) => rank(b[0]) - rank(a[0]))) {
    rows.push({ type: 'header', key, label: bucket.label, count: bucket.items.filter(item => isUnread(item, readIds)).length });
    for (const item of bucket.items) rows.push({ type: 'item', key: item.id, item });
  }
  return rows;
}

export function isUnread(item: InboxItem, readIds: ReadonlySet<string>): boolean {
  return !item.read_at && !readIds.has(item.id);
}

/** Short, kid-readable age: "now", "5m", "2h", "3d", "2w", then "Sep 4", and "Jun 1, 2025" for another year. */
export function shortAgo(iso: string | null | undefined, now: number = Date.now()): string {
  const at = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(at)) return '';
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 60) return 'now';
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  if (d < 35) return `${Math.floor(d / 7)}w`;
  const date = new Date(at);
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const label = `${MONTHS[date.getMonth()]} ${date.getDate()}`;
  return date.getFullYear() === new Date(now).getFullYear() ? label : `${label}, ${date.getFullYear()}`;
}

/** Coins a row gave, read from the stored copy ("... sent you 5 Coins!"), for the +5 chip. 0 when none. */
export function rewardCoins(message: string): number {
  const match = /sent you (\d+) coins?\b/i.exec(message);
  const coins = match ? Number(match[1]) : 0;
  return Number.isFinite(coins) && coins > 0 && coins < 100_000 ? coins : 0;
}

/**
 * The player name a row starts with, split off so it can be set bolder:
 * "finn replied to your thread." -> { lead: "finn", rest: " replied to your thread." }.
 * Only for rows about another player; "You ..." and system rows stay whole.
 */
export function leadName(message: string, kind: NotificationKind): { readonly lead: string; readonly rest: string } {
  const actorKinds: readonly NotificationKind[] = ['friend_request', 'friend_accepted', 'compliment', 'reply'];
  const match = /^(\S+)(\s[\s\S]*)$/.exec(message);
  if (!actorKinds.includes(kind) || !match || /^you$/i.test(match[1]) || match[1].includes('[')) return { lead: '', rest: message };
  return { lead: match[1], rest: match[2] };
}

/** Spoken age for VoiceOver. */
export function spokenAgo(iso: string | null | undefined, now: number = Date.now()): string {
  const short = shortAgo(iso, now);
  const match = /^(\d+)([mhdw])$/.exec(short);
  if (!match) return short === 'now' ? 'just now' : short;
  const unit = { m: 'minute', h: 'hour', d: 'day', w: 'week' }[match[2] as 'm' | 'h' | 'd' | 'w'];
  const n = Number(match[1]);
  return `${n} ${unit}${n === 1 ? '' : 's'} ago`;
}

/**
 * Translate a stored route to the navigator: "User" is the Player screen and
 * some rows send { user } where the screen reads { player }.
 */
export function resolveRoute(route: InboxRoute | null | undefined): { screen: string; params: Record<string, unknown> } | null {
  if (!route?.screen) return null;
  const params = { ...(route.params ?? {}) } as Record<string, unknown>;
  if (route.screen === 'User') return { screen: 'Player', params: { ...params, player: params.user ?? params.player } };
  if (route.screen === 'Park' && params.user != null && params.player == null) return { screen: 'Park', params: { ...params, player: params.user } };
  return { screen: route.screen, params };
}

/** Friends-screen tabs. */
export type FriendsTab = 'friends' | 'requests' | 'find';

export function initialTab(param: unknown, pendingCount: number): FriendsTab {
  if (param === 'friends' || param === 'requests' || param === 'find') return param;
  return pendingCount > 0 ? 'requests' : 'friends';
}

/** Search needs 3 letters on the server: say how many more. */
export function searchHint(query: string): string | null {
  const n = query.trim().length;
  if (n === 0) return null;
  if (n < 3) return `Type ${3 - n} more letter${3 - n === 1 ? '' : 's'}`;
  return null;
}

/**
 * Kid copy for the two friend rows (the stored server sentence is adult and
 * long). Anything that does not match the known sentence is shown as stored.
 */
export function kidMessage(item: InboxItem, message: string, answer?: FriendStatus): string {
  const kind = kindOf(item);
  const name = /^(\S+)\s/.exec(message.trim())?.[1];
  // Answered Yes right here: the row says what is true now, in one line.
  if (kind === 'friend_request' && answer === 'friends' && name) return `You and ${name} are friends now!`;
  if (kind === 'friend_request' && item.friend_status === 'friends' && name) return `You and ${name} are friends now!`;
  const asked = /^(.+?) has sent you a friend request\.?$/i.exec(message.trim());
  if (kind === 'friend_request' && asked) return `${asked[1]} wants to be your friend!`;
  const yes = /^(.+?) has accepted your friend request\.?$/i.exec(message.trim());
  if (kind === 'friend_accepted' && yes) return `${yes[1]} said yes! You're friends now.`;
  return message;
}
