import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Application from 'expo-application';
import * as Device from 'expo-device';
import * as Updates from 'expo-updates';
import { Platform } from 'react-native';
import {
  buildEnvelope,
  makeEventId,
  parseDsn,
  parseStack,
  type Breadcrumb,
  type ParsedDsn,
  type TelemetryEvent,
} from './sentryEnvelope';
import { sentryReleaseAndDist } from './releaseName';
import { readStack } from '../../utils/hermesSafeError';

/**
 * Crash and error reporting plus core-loop breadcrumbs.
 *
 * Sends Sentry envelopes to EXPO_PUBLIC_SENTRY_DSN. Without a DSN everything
 * is a no-op. Events that fail to send (offline, or a fatal crash that kills
 * the app mid-request) are kept in a small outbox and retried next launch.
 */
const OUTBOX_KEY = 'tps.telemetry.outbox.v1';
const OUTBOX_LIMIT = 20;
const BREADCRUMB_LIMIT = 40;
const REPEAT_WINDOW_MS = 5 * 60 * 1000;

type Level = TelemetryEvent['level'];
type Transport = (url: string, body: string) => Promise<boolean>;

const defaultTransport: Transport = async (url, body) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-sentry-envelope' },
    body,
  });
  // 429 and 4xx will not succeed on retry; only keep 5xx and network errors.
  return response.status < 500;
};

let lastFatalWrite: Promise<void> = Promise.resolve();
const FATAL_FLUSH_TIMEOUT_MS = 1500;

const state: {
  dsn: ParsedDsn | null;
  environment: string;
  release?: string;
  dist?: string;
  breadcrumbs: Breadcrumb[];
  lastSentAt: Map<string, number>;
  transport: Transport;
  now: () => number;
  installed: boolean;
} = {
  dsn: null,
  environment: 'development',
  breadcrumbs: [],
  lastSentAt: new Map(),
  transport: defaultTransport,
  now: () => Date.now(),
  installed: false,
};

export type TelemetryOptions = {
  readonly dsn?: string;
  readonly transport?: Transport;
  readonly now?: () => number;
  readonly installGlobalHandlers?: boolean;
};

export function initTelemetry(options: TelemetryOptions = {}): boolean {
  state.dsn = parseDsn(options.dsn ?? process.env.EXPO_PUBLIC_SENTRY_DSN);
  if (options.transport) state.transport = options.transport;
  if (options.now) state.now = options.now;
  state.environment = Updates.channel || (__DEV__ ? 'development' : 'local');
  const { release, dist } = sentryReleaseAndDist({
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
    updateId: Updates.updateId,
    runtimeVersion: Updates.runtimeVersion,
    isEmbeddedLaunch: Updates.isEmbeddedLaunch,
  });
  state.release = release;
  state.dist = dist;
  if (!state.dsn) return false;
  if (options.installGlobalHandlers !== false) installGlobalHandlers();
  void flushOutbox();
  return true;
}


export function addBreadcrumb(category: string, message: string, data?: Breadcrumb['data'], level: Breadcrumb['level'] = 'info'): void {
  state.breadcrumbs.push({ timestamp: state.now() / 1000, category, message, level, ...(data ? { data } : {}) });
  if (state.breadcrumbs.length > BREADCRUMB_LIMIT) state.breadcrumbs.splice(0, state.breadcrumbs.length - BREADCRUMB_LIMIT);
}

export function captureException(error: unknown, context: { fatal?: boolean; handled?: boolean; source?: string } = {}): string | null {
  const err = toError(error);
  return send(context.fatal ? 'fatal' : 'error', {
    exception: {
      values: [{
        type: err.name || 'Error',
        value: err.message || '',
        mechanism: { type: context.source || 'generic', handled: context.handled ?? !context.fatal },
        stacktrace: { frames: parseStack(err.stack) },
      }],
    },
  }, context.source ? { source: context.source } : {}, `${err.name}:${err.message}`);
}

function toError(error: unknown): { name: string; message: string; stack?: string } {
  // Duck-typed: errors from other realms, native bridges or libraries that
  // throw plain objects still carry a useful name, message and stack.
  if (error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string') {
    const candidate = error as { name?: unknown; message: string; stack?: unknown };
    return {
      name: typeof candidate.name === 'string' ? candidate.name : 'Error',
      message: candidate.message,
      // readStack: an axios error's .stack getter throws on Hermes.
      stack: readStack(candidate),
    };
  }
  return { name: 'Error', message: typeof error === 'string' ? error : 'Non-error thrown' };
}

export function captureMessage(message: string, level: Level = 'info', tags: Record<string, string> = {}): string | null {
  return send(level, { message: { formatted: message } }, tags, `msg:${message}`);
}

function send(level: Level, body: Partial<TelemetryEvent>, tags: Record<string, string>, dedupeKey: string): string | null {
  if (!state.dsn) return null;
  const now = state.now();
  const last = state.lastSentAt.get(dedupeKey);
  // A render loop or retrying request must not flood the project.
  if (level !== 'fatal' && last !== undefined && now - last < REPEAT_WINDOW_MS) return null;
  state.lastSentAt.set(dedupeKey, now);
  const event: TelemetryEvent = {
    event_id: makeEventId(),
    timestamp: now / 1000,
    platform: 'javascript',
    level,
    logger: 'tps',
    release: state.release,
    dist: state.dist,
    environment: state.environment,
    tags: { platform: Platform.OS, ...tags },
    contexts: {
      os: { name: Platform.OS === 'ios' ? 'iOS' : Platform.OS, version: Device.osVersion ?? undefined },
      device: { model: Device.modelName ?? undefined, simulator: !Device.isDevice },
      app: { app_version: Application.nativeApplicationVersion ?? undefined, app_build: Application.nativeBuildVersion ?? undefined, update_id: Updates.updateId ?? undefined },
    },
    breadcrumbs: { values: state.breadcrumbs.slice() },
    ...body,
  };
  const envelope = buildEnvelope(event, state.dsn, new Date(now));
  if (level === 'fatal') {
    // The process is about to die: persist first, then try to send.
    lastFatalWrite = persist(envelope);
    void lastFatalWrite.then(() => deliver(envelope, true));
  } else {
    void deliver(envelope, false);
  }
  return event.event_id;
}

async function deliver(envelope: string, alreadyPersisted: boolean): Promise<void> {
  const dsn = state.dsn;
  if (!dsn) return;
  let delivered = false;
  try {
    delivered = await state.transport(dsn.envelopeUrl, envelope);
  } catch {
    delivered = false;
  }
  if (delivered && alreadyPersisted) await removeFromOutbox(envelope);
  if (!delivered && !alreadyPersisted) await persist(envelope);
}

async function readOutbox(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter(item => typeof item === 'string') : [];
  } catch {
    return [];
  }
}

async function writeOutbox(items: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(items.slice(-OUTBOX_LIMIT)));
  } catch {
    // Storage full or unavailable: drop rather than crash the reporter.
  }
}

async function persist(envelope: string): Promise<void> {
  const items = await readOutbox();
  if (!items.includes(envelope)) items.push(envelope);
  await writeOutbox(items);
}

async function removeFromOutbox(envelope: string): Promise<void> {
  const items = await readOutbox();
  await writeOutbox(items.filter(item => item !== envelope));
}

export async function flushOutbox(): Promise<number> {
  const dsn = state.dsn;
  if (!dsn) return 0;
  const items = await readOutbox();
  if (!items.length) return 0;
  const remaining: string[] = [];
  let sent = 0;
  for (const envelope of items) {
    try {
      if (await state.transport(dsn.envelopeUrl, envelope)) sent += 1;
      else remaining.push(envelope);
    } catch {
      remaining.push(envelope);
    }
  }
  await writeOutbox(remaining);
  return sent;
}

type ErrorUtilsShape = {
  getGlobalHandler: () => (error: unknown, isFatal?: boolean) => void;
  setGlobalHandler: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

type HermesShape = {
  enablePromiseRejectionTracker?: (options: { allRejections: boolean; onUnhandled: (id: number, error: unknown) => void; onHandled?: (id: number) => void }) => void;
  hasPromise?: () => boolean;
};

function installGlobalHandlers(): void {
  if (state.installed) return;
  state.installed = true;
  const errorUtils = (globalThis as unknown as { ErrorUtils?: ErrorUtilsShape }).ErrorUtils;
  if (errorUtils) {
    const previous = errorUtils.getGlobalHandler();
    errorUtils.setGlobalHandler((error, isFatal) => {
      captureException(error, { fatal: !!isFatal, handled: false, source: 'onerror' });
      if (!isFatal) {
        previous(error, isFatal);
        return;
      }
      // The default fatal handler terminates the app. Give the crash report
      // a moment to reach disk first (bounded, so a crash is never swallowed).
      let handed = false;
      const handOff = () => {
        if (handed) return;
        handed = true;
        previous(error, isFatal);
      };
      setTimeout(handOff, FATAL_FLUSH_TIMEOUT_MS);
      lastFatalWrite.then(handOff, handOff);
    });
  }
  // Release builds do not track unhandled rejections at all; Hermes can.
  const hermes = (globalThis as unknown as { HermesInternal?: HermesShape }).HermesInternal;
  if (!__DEV__ && hermes?.hasPromise?.() && hermes.enablePromiseRejectionTracker) {
    hermes.enablePromiseRejectionTracker({
      allRejections: true,
      onUnhandled: (_id, error) => captureException(error, { handled: false, source: 'unhandledrejection' }),
    });
  }
}

/** Test-only reset. */
export function __resetTelemetryForTests(): void {
  state.dsn = null;
  state.breadcrumbs = [];
  state.lastSentAt = new Map();
  state.transport = defaultTransport;
  state.now = () => Date.now();
  state.installed = false;
}
