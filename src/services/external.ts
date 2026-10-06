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

/** The system share sheet (text or a link) after the grown-up gate. Null when the grown-up said no. */
export async function shareExternal(content: ShareContent, options?: ShareOptions) {
  if (!(await askGrownUp(SHARE))) return null;
  return Share.share(content, options);
}

/** Shares a file (a share card image) after the grown-up gate. False when declined or unavailable. */
export async function shareFileExternal(uri: string, options?: Sharing.SharingOptions): Promise<boolean> {
  if (!(await askGrownUp(SHARE))) return false;
  if (!(await Sharing.isAvailableAsync())) return false;
  await Sharing.shareAsync(uri, options);
  return true;
}

/** The Terms of Service or Privacy Policy, ungated (Apple allows legal links). */
export function openLegal(url: string | null | undefined): void {
  if (url) void WebBrowser.openBrowserAsync(url).catch(() => undefined);
}

/** iOS Settings for this app's own permissions (location), ungated. */
export function openAppSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}

