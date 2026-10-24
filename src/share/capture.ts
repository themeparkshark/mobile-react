/**
 * Capture a flex card and hand it to the OS share sheet. The OS sheet is the
 * only way out: no in-app posting, no account linking (kid safety).
 */
import { SHARE_TIMED_OUT, shareExternal, shareFileExternal, type ShareFileOutcome } from '../services/external';
import * as Clipboard from 'expo-clipboard';
import * as Sharing from 'expo-sharing';
import type { RefObject } from 'react';
import { PixelRatio, Platform, Share, type View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { FLEX_EXPORT } from './formats';
import type { FlexFormat } from './types';

/** iOS view-shot measures in points, Android in pixels. */
export function flexCaptureSize(format: FlexFormat, platform: string, density: number) {
  const scale = platform === 'ios' && Number.isFinite(density) && density > 0 ? density : 1;
  const px = FLEX_EXPORT[format];
  return { width: px.width / scale, height: px.height / scale };
}

const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

export async function captureFlex(ref: RefObject<View | null>, format: FlexFormat): Promise<string> {
  if (!ref.current) throw new Error('flex card not mounted');
  await nextFrame();
  await nextFrame();
  return captureRef(ref, { format: 'jpg', quality: 0.92, result: 'tmpfile', ...flexCaptureSize(format, Platform.OS, PixelRatio.get()) });
}

export interface ShareOutcome {
  /** How it ended, in the hotfix's words: shared, closed (a cancel on iOS), declined or timeout. */
  readonly ended: ShareFileOutcome;
  /** true once the share sheet opened (and closed or timed out); false when the grown-up said no. */
  readonly opened: boolean;
  /** true shared, false closed without sharing, null unknown (Android, or the sheet never answered). */
  readonly shared: boolean | null;
  /** The sheet never answered in time (it may still be up): neither a share nor a cancel. */
  readonly timedOut?: boolean;
  /** iOS destination activity type, e.g. com.burbn.instagram.shareextension. */
  readonly activity: string | null;
}

/** Map an iOS activity type to a short, stable analytics label. */
export function activityLabel(activity: string | null | undefined): string | null {
  if (!activity) return null;
  const a = activity.toLowerCase();
  if (a.includes('instagram')) return 'instagram';
  if (a.includes('tiktok') || a.includes('musically')) return 'tiktok';
  if (a.includes('snapchat')) return 'snapchat';
  if (a.includes('facebook')) return 'facebook';
  if (a.includes('whatsapp')) return 'whatsapp';
  if (a.includes('twitter') || a.includes('.x.')) return 'x';
  if (a.includes('threads') || a.includes('barcelona')) return 'threads';
  if (a.includes('message')) return 'messages';
  if (a.includes('mail')) return 'mail';
  if (a.includes('savetocameraroll') || a.includes('photos')) return 'save_photo';
  if (a.includes('airdrop')) return 'airdrop';
  if (a.includes('copy')) return 'copy';
  return 'other';
}

/** The picture's name in the share sheet header and in Messages or AirDrop when a card has none of its own. */
export const SHARE_FILE_NAME = 'Theme Park Shark';

/**
 * The OS share sheet for a card picture, after the grown-up gate. `message` (a short line with the
 * app link) rides along so Messages and chat apps get the link without a paste; photo-only targets
 * drop it. `name` titles the file in the share sheet ("Golden Churro" becomes Golden-Churro.jpg),
 * never a UUID (services/external names the copy).
 */
export async function openShareSheet(uri: string, message?: string, name: string = SHARE_FILE_NAME): Promise<ShareOutcome> {
  if (Platform.OS === 'ios') {
    const result = await shareExternal(message ? { url: uri, message } : { url: uri }, undefined, name);
    if (!result) return { ended: 'declined', opened: false, shared: false, activity: null };
    // A sheet that never answered in time (it may still be up): opened, so nothing presents over it,
    // and neither a share nor a cancel.
    if (result === SHARE_TIMED_OUT) return { ended: 'timeout', opened: true, shared: null, timedOut: true, activity: null };
    if (result.action === Share.sharedAction) return { ended: 'shared', opened: true, shared: true, activity: activityLabel(result.activityType) };
    return { ended: 'closed', opened: true, shared: false, activity: null };
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('share sheet unavailable');
  // Android's file share carries the picture only (expo-sharing sends no text; a native share with
  // the text is in the native queue). The picture's QR already scans to the link; the line with the
  // link also goes on the clipboard, and the sheet's title says so.
  if (message) await Clipboard.setStringAsync(message).catch(() => undefined);
  const ended = await shareFileExternal(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: androidShareTitle(message) }, name);
  // A timeout may still have the sheet up: count it as opened, so nothing presents over it.
  if (ended === 'declined') return { ended, opened: false, shared: false, activity: null };
  return { ended, opened: true, shared: null, timedOut: ended === 'timeout', activity: null };
}

/** The Android share sheet's title: tells the grown-up the link is ready to paste. Exported for tests. */
export function androidShareTitle(message?: string): string {
  return message ? 'Share (the link is copied too)' : 'Share';
}
