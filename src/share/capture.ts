/**
 * Capture a flex card and hand it to the OS share sheet. The OS sheet is the
 * only way out: no in-app posting, no account linking (kid safety).
 */
import { shareExternal, shareFileExternal, shareFileName } from '../services/external';
import * as FileSystem from 'expo-file-system';
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
  /** true once the share sheet opened and closed; false when the grown-up said no or it never opened. */
  readonly opened: boolean;
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

/** The picture's name in the share sheet header and in Messages or AirDrop when a card has none of its own. */
export const SHARE_FILE_NAME = 'Theme Park Shark';

/**
 * The capture under a readable name (services/external shareFileName: "Whack-a-Shark-12840.jpg"),
 * never the capture's random id. The same folder as the hotfix's named copies; each share clears it.
 * Any file trouble falls back to the original picture.
 */
export async function friendlyShareFile(uri: string, name: string = SHARE_FILE_NAME): Promise<string> {
  const cache = FileSystem.cacheDirectory;
  if (!cache) return uri;
  const folder = `${cache}share-card/`;
  try {
    await FileSystem.deleteAsync(folder, { idempotent: true });
    await FileSystem.makeDirectoryAsync(folder, { intermediates: true });
    const to = `${folder}${shareFileName(name, 'jpg')}`;
    await FileSystem.copyAsync({ from: uri, to });
    return to;
  } catch {
    return uri;
  }
}

/**
 * The OS share sheet for a card picture. `message` (a short line with the app link) rides
 * along so Messages and chat apps get the link without a paste; photo-only targets drop it.
 */
export async function openShareSheet(uri: string, message?: string, name?: string): Promise<ShareOutcome> {
  const file = await friendlyShareFile(uri, name);
  if (Platform.OS === 'ios') {
    const result = await shareExternal(message ? { url: file, message } : { url: file });
    if (!result) return { opened: false, shared: false, activity: null };
    if (result.action === Share.sharedAction) return { opened: true, shared: true, activity: activityLabel(result.activityType) };
    return { opened: true, shared: false, activity: null };
  }
  if (!await Sharing.isAvailableAsync()) throw new Error('share sheet unavailable');
  if (!(await shareFileExternal(file, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Share' }))) return { opened: false, shared: false, activity: null };
  return { opened: true, shared: null, activity: null };
}
