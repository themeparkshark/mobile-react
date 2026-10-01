/**
 * The last console warnings and errors, kept in memory for tester reports
 * (Settings > Report a Problem, or a shake on the internal channel).
 *
 * installConsoleRing() wraps console.warn and console.error once, near app
 * start. The original methods still run, so LogBox and Xcode logs are
 * unchanged. Lines are trimmed and bearer tokens are masked before storage.
 */
export type LogLevel = 'warn' | 'error';

export type LogLine = {
  readonly level: LogLevel;
  readonly message: string;
  /** Epoch milliseconds. */
  readonly at: number;
};

export const LOG_RING_LIMIT = 50;
export const LOG_LINE_MAX = 1000;

type ConsoleLike = { warn: (...args: unknown[]) => void; error: (...args: unknown[]) => void };

const ring: LogLine[] = [];
let installedOn: ConsoleLike | null = null;

function describe(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Error || (value && typeof value === 'object' && typeof (value as Error).message === 'string'
    && typeof (value as Error).name === 'string')) {
    const error = value as Error;
    const stack = typeof error.stack === 'string' ? error.stack.split('\n').slice(1, 4).map(line => line.trim()).join(' | ') : '';
    return `${error.name}: ${error.message}${stack ? ` (${stack})` : ''}`;
  }
  if (value === undefined) return 'undefined';
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

/** One console call as a single stored line: joined, tokens masked, trimmed. */
export function formatLogArgs(args: readonly unknown[]): string {
  const text = args.map(describe).join(' ')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/|=-]+/gi, '$1[redacted]')
    .replace(/("?(?:[a-z_]*token|password|secret)"?\s*[:=]\s*"?)[^"\s,}]+/gi, '$1[redacted]');
  return text.length > LOG_LINE_MAX ? `${text.slice(0, LOG_LINE_MAX - 3)}...` : text;
}

export function recordLogLine(level: LogLevel, args: readonly unknown[], now: number = Date.now()): void {
  ring.push({ level, message: formatLogArgs(args), at: now });
  if (ring.length > LOG_RING_LIMIT) ring.splice(0, ring.length - LOG_RING_LIMIT);
}

/** Oldest first. A copy, so a report is not changed by later logging. */
export function recentLogLines(): LogLine[] {
  return ring.slice();
}

export function clearLogRing(): void {
  ring.length = 0;
}

/** Idempotent: a second call (Fast Refresh, tests) does not wrap twice. */
export function installConsoleRing(target: ConsoleLike = console): void {
  if (installedOn === target) return;
  installedOn = target;
  for (const level of ['warn', 'error'] as const) {
    const original = target[level].bind(target);
    target[level] = (...args: unknown[]) => {
      try {
        recordLogLine(level, args);
      } catch { /* logging must never throw */ }
      original(...args);
    };
  }
}
