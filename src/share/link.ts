/**
 * The link on every card and in the QR. Human-readable, with a per-kind
 * campaign token so share-to-install is measurable by kind, never by player.
 * themeparkshark.com/app redirects (with its query) to the API's /go/app,
 * which counts the click by campaign and sends the phone to the App Store.
 */
import type { FlexKind } from './types';

export const SHARE_LINK_DISPLAY = 'themeparkshark.com/app';

export function shareCampaign(kind: FlexKind): string {
  return `flex_${kind}`;
}

export function shareUrl(kind: FlexKind): string {
  return `https://${SHARE_LINK_DISPLAY}?c=${shareCampaign(kind)}`;
}
