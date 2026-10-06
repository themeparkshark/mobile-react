import getFeatureFlags from '../api/endpoints/platform/feature-flags';
import getMySecretShop from '../api/endpoints/me/secret-shop';

/**
 * Secret Shop v2 for this player (secret-shop/DESIGN.md 8.3). The per-player
 * answer (GET /me/secret-shop) comes first: it is on for the server's preview
 * list before launch, and for everyone after. A server without that route (or
 * no answer) falls back to the public `secret_shop_v2` flag. Off unless the
 * server sends a real true: an absent flag, an error or an old server all
 * keep today's Secret Store. Cached for 5 minutes so a server flip lands
 * without an app restart. The server enforces the same flag on every route,
 * so this only decides which screen to draw.
 */
const TTL_MS = 5 * 60_000;
let cached: { on: boolean; at: number } | null = null;
let pending: Promise<boolean> | null = null;

export function loadSecretShopFlag(read: typeof getFeatureFlags = getFeatureFlags, now: () => number = Date.now,
  readMine: typeof getMySecretShop = getMySecretShop): Promise<boolean> {
  if (cached && now() - cached.at < TTL_MS) return Promise.resolve(cached.on);
  pending ??= readMine()
    .then(mine => mine.secret_shop_v2 === true)
    .catch(() => read().then(payload => payload?.flags?.secret_shop_v2 === true))
    .then(on => {
      cached = { on, at: now() };
      return on;
    }).catch(() => false).finally(() => { pending = null; });
  return pending;
}

/** The last known value (false before the first answer). */
export function secretShopFlagNow(): boolean {
  return cached?.on ?? false;
}

/** Sign-out: the next account asks again (the preview is per player). */
export function resetSecretShopFlag(): void {
  cached = null;
  pending = null;
}

/** Tests only. */
export function resetSecretShopFlagForTests(): void {
  cached = null;
  pending = null;
}
