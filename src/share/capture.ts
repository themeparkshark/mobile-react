/**
 * Capture a flex card and hand it to the OS share sheet. The OS sheet is the
 * only way out: no in-app posting, no account linking (kid safety).
 */
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
  /** true shared, false closed without sharing, null unknown (Android). */
  readonly shared: boolean | null;
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

export async function openShareSheet(uri: string): Promise<ShareOutcome> {
  if (Platform.OS === 'ios') {
    const result = await Share.share({ url: uri });
    if (result.action === Share.sharedAction) return { shared: true, activity: activityLabel(result.activityType) };
    return { shared: false, activity: null };
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('share sheet unavailable');
  await Sharing.shareAsync(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Share' });
  return { shared: null, activity: null };
}
