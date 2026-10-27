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
import { Linking, Platform, Share, type ShareContent, type ShareOptions } from 'react-native';
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

/** The share sheet never answered within SHARE_SHEET_WAIT_MS (it may still be up): not a share, not a cancel. */
export const SHARE_TIMED_OUT = 'timeout' as const;

/** Runs a share's after-yes step; its failure never blocks the sheet. */
async function runAfterYes(afterYes?: () => Promise<void> | void): Promise<void> {
  if (!afterYes) return;
  try { await afterYes(); } catch { /* the picture still shares */ }
}

/**
 * The system share sheet (text, a link or a file url) after the grown-up gate. Null when the
 * grown-up said no, SHARE_TIMED_OUT when the sheet never answered within SHARE_SHEET_WAIT_MS.
 * `name` titles a file url in the sheet header ("Golden Churro" becomes Golden-Churro.jpg),
 * like shareFileExternal. The named copy is made while the grown-up answers.
 */
export async function shareExternal(content: ShareContent, options?: ShareOptions, name?: string, afterYes?: () => Promise<void> | void) {
  const url = 'url' in content && content.url ? content.url : null;
  const copying = url && name ? namedShareCopy(url, name) : null;
  if (!(await askGrownUp(SHARE))) {
    void copying?.then(copy => copy.release());
    return null;
  }
  // Only after the grown-up's yes (a link on the clipboard, for one): a "Not now" changes nothing.
  await runAfterYes(afterYes);
  const copy = copying ? await copying : { file: url ?? '', release: () => undefined };
  const named = copying ? { ...content, url: copy.file } : content;
  return waitForSheet<Awaited<ReturnType<typeof Share.share>> | typeof SHARE_TIMED_OUT>(Share.share(named, options), copy, SHARE_TIMED_OUT);
}

/**
 * A readable file name for the share sheet header ("Whack-a-Shark-460.png"), never
 * the capture's UUID. Letters, digits and dashes only. Exported for tests.
 */
export function shareFileName(name: string, ext: string): string {
  const base = name.replace(/['\u2019]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60).replace(/-+$/, '');
  return `${base || 'Theme-Park-Shark'}.${ext}`;
}

/** The named copies live here, one subfolder per share so each keeps its readable name. */
const SHARE_DIR = 'share-card/';

/** Subfolders whose share sheet has not closed yet: never deleted, even after a timeout. */
const liveShareDirs = new Set<string>();
let shareSeq = 0;

/** A share copy and the release to call once its sheet has really closed. */
interface ShareCopy { readonly file: string; readonly release: () => void }

/**
 * The capture copied under a readable name, in its own subfolder. Older copies are
 * cleared after this one is made (off the share's path), except any a sheet still holds
 * open (a sheet can outlive the SHARE_SHEET_WAIT_MS timeout), so copies never pile up
 * and an open sheet never loses its file. The original uri when the copy cannot be made.
 */
async function namedShareCopy(uri: string, name: string | undefined): Promise<ShareCopy> {
  const cache = FileSystem.cacheDirectory;
  // view-shot hands back a bare path on iOS ("/private/var/.../UUID.png"); expo-file-system wants file://.
  const from = uri.startsWith('/') ? `file://${uri}` : uri;
  const unnamed: ShareCopy = { file: uri, release: () => undefined };
  if (!name || !cache || !/^file:/i.test(from)) return unnamed;
  const ext = (/\.([A-Za-z0-9]{2,5})(?:[?#].*)?$/.exec(from)?.[1] ?? 'png').toLowerCase();
  const root = `${cache}${SHARE_DIR}`;
  const slot = `${Date.now().toString(36)}-${(shareSeq += 1)}`;
  const dir = `${root}${slot}/`;
  // Held from the start, so a sweep from another share never clears it half made.
  liveShareDirs.add(slot);
  const release = () => { liveShareDirs.delete(slot); };
  try {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
    const to = `${dir}${shareFileName(name, ext)}`;
    await FileSystem.copyAsync({ from, to });
    void sweepShareCopies(root);
    return { file: to, release };
  } catch {
    release();
    return unnamed;
  }
}

/** Deletes every share copy no open sheet holds. Runs in the background, never on a share's path. */
async function sweepShareCopies(root: string): Promise<void> {
  const old = await FileSystem.readDirectoryAsync(root).catch(() => [] as string[]);
  await Promise.all(old.filter(entry => !liveShareDirs.has(entry))
    .map(entry => FileSystem.deleteAsync(`${root}${entry}`, { idempotent: true }).catch(() => undefined)));
}

/** Races a sheet against SHARE_SHEET_WAIT_MS; the copy is released only when the sheet itself settles. */
async function waitForSheet<T>(sheet: Promise<T>, copy: ShareCopy, onTimeout: T): Promise<T> {
  void sheet.then(copy.release, copy.release);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      sheet,
      new Promise<T>(resolve => { timer = setTimeout(() => resolve(onTimeout), SHARE_SHEET_WAIT_MS); }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How a file share ended:
 * - shared: iOS says the kid picked a place and it went (Messages, Save Image...);
 * - closed: the sheet came up and closed. On iOS that is a cancel; Android never says, so
 *   there it means shared or cancelled. Never show a success stamp for this one;
 * - declined: the grown-up said no, or this phone cannot share;
 * - timeout: the sheet never answered within SHARE_SHEET_WAIT_MS (it may still be up and
 *   working), so the button comes back without counting it as a no.
 */
export type ShareFileOutcome = 'shared' | 'closed' | 'declined' | 'timeout';

/**
 * Shares a file (a share card image) after the grown-up gate. Throws when the sheet
 * fails to open. `name` titles the file in the sheet ("Whack-a-Shark 460" becomes
 * Whack-a-Shark-460.png). On iOS this is the same system sheet through Share.share,
 * which tells a real share apart from a cancel.
 */
export async function shareFileExternal(uri: string, options?: Sharing.SharingOptions, name?: string, afterYes?: () => Promise<void> | void): Promise<ShareFileOutcome> {
  // The named copy is made while the grown-up answers, so the sheet opens right after OK.
  const copying = namedShareCopy(uri, name);
  const drop = (outcome: ShareFileOutcome) => { void copying.then(copy => copy.release()); return outcome; };
  if (!(await askGrownUp(SHARE))) return drop('declined');
  await runAfterYes(afterYes);
  if (Platform.OS === 'ios') {
    const copy = await copying;
    const file = copy.file.startsWith('/') ? `file://${copy.file}` : copy.file;
    const sheet = Share.share({ url: file }).then((result): ShareFileOutcome => (
      result.action === Share.sharedAction ? 'shared' : 'closed'));
    return waitForSheet(sheet, copy, 'timeout');
  }
  if (!(await Sharing.isAvailableAsync())) return drop('declined');
  const copy = await copying;
  return waitForSheet(Sharing.shareAsync(copy.file, options).then((): ShareFileOutcome => 'closed'), copy, 'timeout');
}

/** The Terms of Service or Privacy Policy, ungated (Apple allows legal links). */
export function openLegal(url: string | null | undefined): void {
  if (url) void WebBrowser.openBrowserAsync(url).catch(() => undefined);
}

/** iOS Settings for this app's own permissions (location), ungated. */
export function openAppSettings(): void {
  void Linking.openSettings().catch(() => undefined);
}

