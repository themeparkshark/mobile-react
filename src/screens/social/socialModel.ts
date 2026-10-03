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
  readonly icon: GameIconName;
  /** Badge fill behind the art. */
  readonly color: string;
  /** Darker lip under the badge. */
  readonly lip: string;
  /** Short tag read by VoiceOver before the message. */
  readonly spoken: string;
}

export const KIND_LOOK: Readonly<Record<NotificationKind, KindLook>> = {
  friend_request: { icon: 'shark', color: '#8A5CF6', lip: '#5B35B8', spoken: 'Friend request' },
  friend_accepted: { icon: 'check', color: '#3CB85C', lip: '#237A3B', spoken: 'New friend' },
  compliment: { icon: 'heart', color: '#FF8A3D', lip: '#C25A12', spoken: 'Compliment' },
  reply: { icon: 'info', color: '#1E9BF0', lip: '#0B5FA0', spoken: 'Reply' },
  park_coins: { icon: 'coin', color: '#F2B21B', lip: '#B57F00', spoken: 'Park coins' },
  prize: { icon: 'gift', color: '#EF4A3C', lip: '#B3261B', spoken: 'Prize' },
  news: { icon: 'bell', color: '#0879CA', lip: '#05468F', spoken: 'News' },
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
 * Time buckets a kid can trust: Today, This week, Earlier. Each strictly newest
 * first. Unread is shown on the row itself (glow and stripe), and the first
 * header carries how many are still unread.
 */
export function sectionize<T extends InboxItem>(items: readonly T[], readIds: ReadonlySet<string>, now: number = Date.now()): InboxRow<T>[] {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  const today = day.getTime();
  const week = today - 6 * 86_400_000;
  const buckets: { key: string; label: string; items: T[] }[] = [
    { key: 'h-today', label: 'Today', items: [] },
    { key: 'h-week', label: 'This week', items: [] },
    { key: 'h-earlier', label: 'Earlier', items: [] },
  ];
  const sorted = [...items].sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
  for (const item of sorted) {
    const at = Date.parse(item.created_at) || 0;
    buckets[at >= today ? 0 : at >= week ? 1 : 2].items.push(item);
  }
  const rows: InboxRow<T>[] = [];
  for (const bucket of buckets) {
    if (!bucket.items.length) continue;
    rows.push({ type: 'header', key: bucket.key, label: bucket.label, count: bucket.items.filter(item => isUnread(item, readIds)).length });
    for (const item of bucket.items) rows.push({ type: 'item', key: item.id, item });
  }
  return rows;
}

export function isUnread(item: InboxItem, readIds: ReadonlySet<string>): boolean {
  return !item.read_at && !readIds.has(item.id);
}

/** Short, kid-readable age: "now", "5m", "2h", "3d", "2w", then "Sep 4". */
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
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
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
