/**
 * The core loop, as seen from the API client. Every event is derived from a
 * request the app already makes, so no screen needs instrumenting. Only the
 * method, a normalized route and the status are ever recorded: never bodies,
 * tokens, query strings, coordinates or ids.
 */
export type CoreLoopEvent =
  | 'auth.sign_in'
  | 'ride_challenge.start'
  | 'ride_challenge.resolve'
  | 'coin.level_up'
  | 'queue_play.start'
  | 'queue_play.complete'
  | 'raid.attack'
  | 'trip_goal.set'
  | 'reward.redeem'
  | 'daily_gift.redeem'
  | 'store.purchase'
  | 'account.delete';

const RULES: readonly (readonly [string, RegExp, CoreLoopEvent])[] = [
  ['POST', /^\/auth\/login$/, 'auth.sign_in'],
  ['POST', /^\/me\/task-attempts$/, 'ride_challenge.start'],
  ['POST', /^\/me\/task-attempts\/:id\/resolve$/, 'ride_challenge.resolve'],
  ['POST', /^\/me\/ride-coins\/:id\/level-up$/, 'coin.level_up'],
  ['POST', /^\/me\/line-sessions$/, 'queue_play.start'],
  ['POST', /^\/me\/line-sessions\/:id\/complete$/, 'queue_play.complete'],
  ['POST', /^\/raids\/:id\/attack$/, 'raid.attack'],
  ['PUT', /^\/me\/trip-goal$/, 'trip_goal.set'],
  ['POST', /^\/(redeemables|items|keys)\/:id\/redeem$/, 'reward.redeem'],
  ['POST', /^\/me\/prep-item-sets\/[^/]+\/claim$/, 'reward.redeem'],
  ['PUT', /^\/daily-gifts\/:id$/, 'daily_gift.redeem'],
  ['POST', /^\/me\/inventory\/items\/:id\/purchase$/, 'store.purchase'],
  ['DELETE', /^\/me\/force-delete$/, 'account.delete'],
];

/** '/api/me/task-attempts/42/resolve?x=1' -> '/me/task-attempts/:id/resolve' */
export function normalizeRoute(url: string | undefined): string {
  if (!url) return '';
  let path = url.replace(/^[a-z]+:\/\/[^/]+/i, '').split('?')[0].split('#')[0];
  path = path.replace(/^\/api(?=\/)/, '');
  if (!path.startsWith('/')) path = `/${path}`;
  return path
    .split('/')
    .map(part => (/^\d+$/.test(part) || /^[0-9a-f-]{16,}$/i.test(part) ? ':id' : part))
    .join('/')
    .replace(/\/+$/, '') || '/';
}

export function classifyCoreLoopRequest(method: string | undefined, url: string | undefined): CoreLoopEvent | null {
  const verb = (method || 'get').toUpperCase();
  const route = normalizeRoute(url);
  for (const [ruleMethod, pattern, event] of RULES) {
    if (ruleMethod === verb && pattern.test(route)) return event;
  }
  return null;
}
