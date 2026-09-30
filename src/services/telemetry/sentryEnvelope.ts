/**
 * Minimal Sentry wire format (envelope endpoint), dependency free.
 * Enough for JS crash and error reporting from a React Native release build
 * without the native SDK. Swap for @sentry/react-native when it is installed
 * (native crash capture); telemetry/index.ts is the only caller.
 */
export type ParsedDsn = {
  readonly publicKey: string;
  readonly projectId: string;
  readonly envelopeUrl: string;
  readonly dsn: string;
};

export type Breadcrumb = {
  readonly timestamp: number;
  readonly category: string;
  readonly message: string;
  readonly level?: 'info' | 'warning' | 'error';
  readonly data?: Readonly<Record<string, string | number | boolean>>;
};

export type StackFrame = {
  readonly function?: string;
  readonly filename?: string;
  readonly lineno?: number;
  readonly colno?: number;
  readonly in_app: boolean;
};

export type TelemetryEvent = {
  readonly event_id: string;
  readonly timestamp: number;
  readonly platform: 'javascript';
  readonly level: 'fatal' | 'error' | 'warning' | 'info';
  readonly logger: string;
  readonly release?: string;
  readonly dist?: string;
  readonly environment: string;
  readonly user?: { readonly id: string };
  readonly tags: Readonly<Record<string, string>>;
  readonly contexts: Readonly<Record<string, Readonly<Record<string, string | number | boolean | undefined>>>>;
  readonly breadcrumbs: { readonly values: readonly Breadcrumb[] };
  readonly exception?: { readonly values: readonly { type: string; value: string; mechanism: { type: string; handled: boolean }; stacktrace?: { frames: readonly StackFrame[] } }[] };
  readonly message?: { readonly formatted: string };
};

export function parseDsn(dsn: string | undefined | null): ParsedDsn | null {
  if (!dsn) return null;
  const match = /^(https?):\/\/([^:@/]+)(?::[^@/]*)?@([^/]+)\/(?:(.*)\/)?(\d+)\/?$/.exec(dsn.trim());
  if (!match) return null;
  const [, protocol, publicKey, host, pathPrefix, projectId] = match;
  const prefix = pathPrefix ? `/${pathPrefix}` : '';
  return {
    publicKey,
    projectId,
    dsn: dsn.trim(),
    envelopeUrl: `${protocol}://${host}${prefix}/api/${projectId}/envelope/?sentry_key=${encodeURIComponent(publicKey)}&sentry_version=7&sentry_client=tps-rn%2F1.0`,
  };
}

export function makeEventId(random: () => number = Math.random): string {
  let id = '';
  for (let i = 0; i < 32; i += 1) id += Math.floor(random() * 16).toString(16);
  return id;
}

/** Hermes and JSC stack lines, oldest frame first as Sentry expects. */
export function parseStack(stack: string | undefined): StackFrame[] {
  if (!stack) return [];
  const frames: StackFrame[] = [];
  for (const raw of stack.split('\n')) {
    const line = raw.trim();
    let match = /^at (?:(.+?) )?\(?(?:address at )?([^()]+?):(\d+):(\d+)\)?$/.exec(line);
    if (match) {
      frames.push(frame(match[1], match[2], match[3], match[4]));
      continue;
    }
    match = /^(?:(.*?)@)?(.+?):(\d+):(\d+)$/.exec(line);
    if (match && !line.startsWith('at ')) frames.push(frame(match[1], match[2], match[3], match[4]));
  }
  return frames.slice(0, 50).reverse();
}

function frame(fn: string | undefined, file: string, line: string, col: string): StackFrame {
  const filename = file.replace(/^.*\/(?=[^/]+$)/, 'app:///');
  return {
    function: fn || '?',
    filename,
    lineno: Number(line),
    colno: Number(col),
    in_app: !/node_modules|native/.test(file),
  };
}

export function buildEnvelope(event: TelemetryEvent, dsn: ParsedDsn, sentAt: Date): string {
  const header = JSON.stringify({ event_id: event.event_id, sent_at: sentAt.toISOString(), dsn: dsn.dsn });
  return `${header}\n${JSON.stringify({ type: 'event' })}\n${JSON.stringify(event)}\n`;
}
