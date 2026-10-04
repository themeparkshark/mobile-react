/**
 * The last line of defense for errors the React error boundary can never see:
 * a throw inside an onPress handler, a timer, an animation callback or a
 * native-module callback. React Native routes those to ErrorUtils' global
 * handler, and in release the default handler closes the app (no .ips, no
 * explanation).
 *
 * installFatalHandler() wraps that handler once, at app start:
 *  - every error (fatal or not) is saved as the "last error" in AsyncStorage,
 *    so Settings > Report a Problem can attach it after the fact;
 *  - a fatal error in a release build, while the app shell is mounted, is
 *    shown as the "Something went wrong / TAP TO RELOAD" card instead of
 *    killing the process (AppErrorBoundary subscribes);
 *  - dev builds and anything before the shell mounts keep the default
 *    behaviour (red box in dev, a real crash otherwise), so nothing is hidden.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { readStack } from '../utils/hermesSafeError';

export const LAST_ERROR_KEY = 'tps.lastError.v1';
const MESSAGE_MAX = 500;
const STACK_MAX = 1500;

export type SavedError = {
  readonly name: string;
  readonly message: string;
  readonly stack?: string;
  readonly fatal: boolean;
  /** Where it was caught: 'global' (ErrorUtils) or 'boundary' (a render error). */
  readonly source: 'global' | 'boundary';
  /** Epoch milliseconds. */
  readonly at: number;
};

type Handler = (error: unknown, isFatal?: boolean) => void;
type ErrorUtilsShape = { getGlobalHandler: () => Handler; setGlobalHandler: (handler: Handler) => void };
type Storage = Pick<typeof AsyncStorage, 'getItem' | 'setItem'>;
type Listener = (error: SavedError) => void;

const listeners = new Set<Listener>();
let installed = false;
let storage: Storage = AsyncStorage;

/** Name, message and a trimmed stack from anything thrown. Never throws. */
export function describeError(error: unknown, fatal: boolean, source: SavedError['source'], now = Date.now()): SavedError {
  let name = 'Error';
  let message = 'Non-error thrown';
  try {
    if (error && typeof error === 'object') {
      const candidate = error as { name?: unknown; message?: unknown };
      if (typeof candidate.name === 'string' && candidate.name) name = candidate.name;
      if (typeof candidate.message === 'string') message = candidate.message;
    } else if (typeof error === 'string') {
      message = error;
    }
  } catch { /* exotic getters: keep the defaults */ }
  const stack = readStack(error);
  return {
    name,
    message: message.slice(0, MESSAGE_MAX),
    ...(stack ? { stack: stack.slice(0, STACK_MAX) } : {}),
    fatal,
    source,
    at: now,
  };
}

export async function saveLastError(saved: SavedError): Promise<void> {
  try {
    await storage.setItem(LAST_ERROR_KEY, JSON.stringify(saved));
  } catch { /* storage full or unavailable: never throw from a crash path */ }
}

export async function readLastError(): Promise<SavedError | null> {
  try {
    const raw = await storage.getItem(LAST_ERROR_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedError;
    return parsed && typeof parsed.message === 'string' && typeof parsed.at === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

/** One line for a tester report ("Last error 2026-10-04T11:02:03Z (fatal): TypeError: x (at ...)"). */
export function lastErrorLine(saved: SavedError): string {
  const frames = saved.stack ? saved.stack.split('\n').slice(0, 4).map(line => line.trim()).filter(Boolean).join(' | ') : '';
  return `Last error ${new Date(saved.at).toISOString()} (${saved.fatal ? 'fatal' : 'non-fatal'}, ${saved.source}): `
    + `${saved.name}: ${saved.message}${frames ? ` (${frames})` : ''}`;
}

/** Testers see the raw message on the card so a screenshot is a full bug report. */
export function showsErrorDetail(channel: string | null | undefined, dev: boolean): boolean {
  return dev || channel === 'testflight' || channel === 'internal-tunnel';
}

/** AppErrorBoundary listens here; returns an unsubscribe. */
export function subscribeFatal(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function installFatalHandler({ errorUtils, dev, report, storage: injected }: {
  readonly errorUtils?: ErrorUtilsShape;
  readonly dev: boolean;
  /** Crash reporting (telemetry). Must never throw. */
  readonly report?: (error: unknown, fatal: boolean) => void;
  readonly storage?: Storage;
}): boolean {
  if (injected) storage = injected;
  if (installed || !errorUtils) return false;
  installed = true;
  const previous = errorUtils.getGlobalHandler();
  errorUtils.setGlobalHandler((error, isFatal) => {
    const fatal = !!isFatal;
    const saved = describeError(error, fatal, 'global');
    void saveLastError(saved);
    // Dev keeps the red box. Before the shell mounts there is no card to show: crash as before.
    if (dev || !fatal || listeners.size === 0) {
      previous(error, isFatal);
      return;
    }
    try { report?.(error, fatal); } catch { /* reporting must never throw here */ }
    for (const listener of [...listeners]) {
      try { listener(saved); } catch { /* one bad listener must not hide the card */ }
    }
  });
  return true;
}

/** Test-only reset. */
export function __resetFatalHandlerForTests(): void {
  installed = false;
  listeners.clear();
  storage = AsyncStorage;
}
