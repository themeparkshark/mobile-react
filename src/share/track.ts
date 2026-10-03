/**
 * Share analytics, no PII: kind, surface, format, action, destination app and
 * rarity. Never the item name, the player, or anything typed. Fire and forget.
 */
import { postShareEvent, type ShareEventBody } from '../api/endpoints/me/share';
import { addBreadcrumb } from '../services/telemetry';

const KEY = /^[a-z0-9_]{1,32}$/;

/** Only short snake_case tokens leave the device. */
export function shareEvent(body: ShareEventBody): ShareEventBody | null {
  if (!KEY.test(body.kind) || !KEY.test(body.surface)) return null;
  const activity = body.activity && KEY.test(body.activity) ? body.activity : null;
  const rarity = typeof body.rarity === 'number' && body.rarity >= 1 && body.rarity <= 5 ? Math.round(body.rarity) : null;
  return { kind: body.kind, surface: body.surface, format: body.format, action: body.action, activity, rarity };
}

export function trackShare(body: ShareEventBody): void {
  const clean = shareEvent(body);
  if (!clean) return;
  addBreadcrumb('share', `${clean.kind}:${clean.action}`, { surface: clean.surface, format: clean.format, activity: clean.activity ?? '' });
  postShareEvent(clean).catch(() => undefined);
}
