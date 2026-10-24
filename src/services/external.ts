/**
 * Every way out of the app (Apple Kids category, guideline 1.3): web pages,
 * the App Store, mail, and the share sheet all go through a grown-up first
 * (components/GrownUpGate). Every exit asks: no pass carries over to it.
 *
 * The explicit, ungated exceptions:
 * - openLegal(): the Terms of Service and Privacy Policy pages, which Apple
 *   lets a kids app link to directly. Callers are pinned by a test.
 * - openAppSettings(): iOS Settings for this app's own permissions.
 * - In-app YouTube playback is not an exit (the player blocks every link out;
 *   components/watch/watchFeed.ts) and never comes through here.
 *
 * A source test fails the build on any bare Linking.openURL,
 * WebBrowser.openBrowserAsync, Share.share or Sharing.shareAsync outside this file.
 */
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as WebBrowser from 'expo-web-browser';
import { Linking, Share, type ShareContent, type ShareOptions } from 'react-native';
import { askGrownUp, type GateReason } from '../components/GrownUpGate';

/** Where a link goes, in kid words, for the grown-up gate's "This leaves the game" line. Exported for tests. */
export function exitReason(url: string): GateReason {
  if (/^mailto:/i.test(url)) return { kind: 'leave', where: 'email' };
  if (/^itms-apps:|apps\.apple\.com/i.test(url)) return { kind: 'leave', where: 'the App Store' };
  return { kind: 'leave', where: 'a website' };
}
const SHARE: GateReason = { kind: 'share' };

/**
 * Opens a link outside the app after the grown-up gate: 'browser' is the in-app
 * Safari sheet, 'system' hands the URL to iOS (mail, the App Store). False when
 * the grown-up said no or nothing can open it.
 */
export async function openExternal(url: string, via: 'browser' | 'system' = 'browser'): Promise<boolean> {
  if (!url || !(await askGrownUp(exitReason(url)))) return false;
  try {
    if (via === 'browser') {
      await WebBrowser.openBrowserAsync(url);
      return true;
    }
    if (!(await Linking.canOpenURL(url))) return false;
    await Linking.openURL(url);
    return true;
  } catch {
    if (via === 'browser') {
      try { await Linking.openURL(url); return true; } catch { return false; }
    }
    return false;
  }
}

/**
 * The longest a share button waits on the share sheet. iOS never answers when it
 * could not show the sheet, so after this the button comes back (the sheet, if it
 * is up, stays up and still works). Exported for tests.
 */
export const SHARE_SHEET_WAIT_MS = 30_000;

/**
 * The system share sheet (text, a link or a file url) after the grown-up gate. Null when the
 * grown-up said no or the sheet never answered within SHARE_SHEET_WAIT_MS. `name` titles a
 * file url in the sheet header ("Golden Churro" becomes Golden-Churro.jpg), like shareFileExternal.
 */
export async function shareExternal(content: ShareContent, options?: ShareOptions, name?: string) {
  if (!(await askGrownUp(SHARE))) return null;
  const url = 'url' in content && content.url ? content.url : null;
  const named = url && name ? { ...content, url: await namedShareCopy(url, name) } : content;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Share.share(named, options),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), SHARE_SHEET_WAIT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A readable file name for the share sheet header ("Whack-a-Shark-460.png"), never
 * the capture's UUID. Letters, digits and dashes only. Exported for tests.
 */
export function shareFileName(name: string, ext: string): string {
  const base = name.replace(/['\u2019]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return `${base || 'Theme-Park-Shark'}.${ext}`;
}

/** One folder for the named copy; each share clears the last one, so copies never pile up. */
const SHARE_DIR = 'share-card/';

/** The capture copied under a readable name. The original uri when the copy cannot be made. */
async function namedShareCopy(uri: string, name: string | undefined): Promise<string> {
  const cache = FileSystem.cacheDirectory;
  // view-shot hands back a bare path on iOS ("/private/var/.../UUID.png"); expo-file-system wants file://.
  const from = uri.startsWith('/') ? `file://${uri}` : uri;
  if (!name || !cache || !/^file:/i.test(from)) return uri;
  const ext = (/\.([A-Za-z0-9]{2,5})(?:[?#].*)?$/.exec(from)?.[1] ?? 'png').toLowerCase();
  const dir = `${cache}${SHARE_DIR}`;
  try {
    await FileSystem.deleteAsync(dir, { idempotent: true });
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const to = `${dir}${shareFileName(name, ext)}`;
    await FileSystem.copyAsync({ from, to });
    return to;
  } catch {
    return uri;
  }
}

/**
 * How a file share ended:
 * - closed: the share sheet came up and closed again (shared or cancelled; iOS does not say which);
 * - declined: the grown-up said no, or this phone cannot share;
 * - timeout: the sheet never answered within SHARE_SHEET_WAIT_MS (it may still be up and
 *   working), so the button comes back without counting it as a no.
 */
export type ShareFileOutcome = 'closed' | 'declined' | 'timeout';

/**
 * Shares a file (a share card image) after the grown-up gate. Throws when the sheet
 * fails to open. `name` titles the file in the sheet ("Whack-a-Shark 460" becomes
 * Whack-a-Shark-460.png).
 */
export async function shareFileExternal(uri: string, options?: Sharing.SharingOptions, name?: string): Promise<ShareFileOutcome> {
  if (!(await askGrownUp(SHARE))) return 'declined';
  if (!(await Sharing.isAvailableAsync())) return 'declined';
  const file = await namedShareCopy(uri, name);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Sharing.shareAsync(file, options).then((): ShareFileOutcome => 'closed'),
      new Promise<ShareFileOutcome>(resolve => { timer = setTimeout(() => resolve('timeout'), SHARE_SHEET_WAIT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** The Terms of Service or Privacy Policy, ungated (Apple allows legal links). */
export function openLegal(url: string | null | undefined): void {
  if (url) void WebBrowser.openBrowserAsync(url).catch(() => undefined);
}

/** iOS Settings for this app's own permissions (location), ungated. */
export function openAppSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}

