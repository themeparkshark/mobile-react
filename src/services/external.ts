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
 * The system share sheet (text or a link) after the grown-up gate. Null when the
 * grown-up said no or the sheet never answered within SHARE_SHEET_WAIT_MS.
 */
export async function shareExternal(content: ShareContent, options?: ShareOptions) {
  if (!(await askGrownUp(SHARE))) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Share.share(content, options),
      new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), SHARE_SHEET_WAIT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Shares a file (a share card image) after the grown-up gate. True once the share
 * sheet closes (shared or cancelled). False when declined, unavailable, or the sheet
 * never answered within SHARE_SHEET_WAIT_MS. Throws when the sheet fails to open.
 */
export async function shareFileExternal(uri: string, options?: Sharing.SharingOptions): Promise<boolean> {
  if (!(await askGrownUp(SHARE))) return false;
  if (!(await Sharing.isAvailableAsync())) return false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Sharing.shareAsync(uri, options).then(() => true),
      new Promise<boolean>(resolve => { timer = setTimeout(() => resolve(false), SHARE_SHEET_WAIT_MS); }),
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

