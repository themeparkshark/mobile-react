/**
 * Tester feedback: when shake is on, the shake detector, the screenshot size
 * and the POST /me/feedback body. Pure, so it is unit tested
 * (tools/tests/tester-feedback.test.cjs).
 */
import type { LogLine } from './consoleRing';

export type FeedbackTrigger = 'shake' | 'settings';

export const FEEDBACK_COPY = {
  settingsTitle: 'Report a Problem',
  settingsDetail: 'Send a screenshot and a note',
  title: 'Report a Problem',
  message: 'What went wrong? Your screen and device details come along automatically.',
  placeholder: 'What happened? What did you expect?',
  screenshotOn: 'Screenshot attached',
  screenshotOff: 'Screenshot left out',
  noScreenshot: 'No screenshot this time',
  send: 'Send Report',
  cancel: 'Cancel',
  needSomething: 'Add a note or attach the screenshot.',
  failed: 'That did not send. Check your connection and try again.',
  sentTitle: 'Thanks!',
  sentMessage: 'Your report is in. Dustin will take a look.',
  sentButton: 'Back to the Park',
} as const;

export const NOTE_MAX = 4000;

/** Shake to report: only the internal tester channel, and dev builds. */
export function shakeEnabled({ channel, isDev }: { readonly channel?: string | null; readonly isDev: boolean }): boolean {
  return isDev || channel === 'internal-tunnel';
}

export type ShakeOptions = {
  /** Total acceleration, in g, that counts as one jolt (1 g is the phone at rest). */
  readonly thresholdG: number;
  /** Jolts needed inside windowMs. */
  readonly jolts: number;
  readonly windowMs: number;
  /** Jolts closer than this are one jolt. */
  readonly minGapMs: number;
  /** Quiet time after a shake fires. */
  readonly cooldownMs: number;
};

export const SHAKE_DEFAULTS: ShakeOptions = { thresholdG: 2.2, jolts: 3, windowMs: 1200, minGapMs: 90, cooldownMs: 4000 };

/** Feed accelerometer samples (in g); returns true on the sample that completes a shake. */
export function createShakeDetector(options: ShakeOptions = SHAKE_DEFAULTS) {
  let jolts: number[] = [];
  let quietUntil = 0;
  return (sample: { readonly x: number; readonly y: number; readonly z: number }, now: number): boolean => {
    if (now < quietUntil) return false;
    const magnitude = Math.sqrt(sample.x * sample.x + sample.y * sample.y + sample.z * sample.z);
    if (!Number.isFinite(magnitude) || magnitude < options.thresholdG) return false;
    jolts = jolts.filter(at => now - at <= options.windowMs);
    const last = jolts[jolts.length - 1];
    if (last !== undefined && now - last < options.minGapMs) return false;
    jolts.push(now);
    if (jolts.length < options.jolts) return false;
    jolts = [];
    quietUntil = now + options.cooldownMs;
    return true;
  };
}

/** About 720 px wide whatever the device: iOS view-shot sizes in points, Android in pixels. */
export function feedbackCaptureSize(platform: string, density: number, window: { readonly width: number; readonly height: number }) {
  const scale = platform === 'ios' && Number.isFinite(density) && density > 0 ? density : 1;
  const ratio = window.width > 0 && window.height > 0 ? window.height / window.width : 16 / 9;
  const width = Math.round(720 / scale);
  return { width, height: Math.round(width * ratio) };
}

export type FeedbackSnapshot = {
  readonly route?: string | null;
  readonly player?: { readonly id: number; readonly username?: string | null; readonly screen_name?: string | null } | null;
  readonly park?: { readonly id: number; readonly name?: string | null } | null;
  readonly gps?: { readonly accuracyMeters?: number | null; readonly timestamp?: number | null } | null;
  readonly app: { readonly version?: string | null; readonly build?: string | null };
  readonly updates: {
    readonly updateId?: string | null;
    readonly channel?: string | null;
    readonly runtimeVersion?: string | null;
    readonly isEmbeddedLaunch?: boolean;
  };
  readonly device: { readonly modelName?: string | null; readonly osName?: string | null; readonly osVersion?: string | null };
  readonly isDev: boolean;
  readonly now: number;
};

const clean = (value: string | null | undefined) => (typeof value === 'string' && value.trim() ? value.trim() : null);

/** Everything the report carries besides the note and screenshot. Empty values are dropped. */
export function feedbackContext(snapshot: FeedbackSnapshot): Record<string, string | number | boolean> {
  const accuracy = snapshot.gps?.accuracyMeters;
  const sampledAt = snapshot.gps?.timestamp;
  const entries: [string, string | number | boolean | null | undefined][] = [
    ['route', clean(snapshot.route)],
    ['park_id', snapshot.park?.id ?? null],
    ['park_name', clean(snapshot.park?.name)],
    ['gps_accuracy_m', typeof accuracy === 'number' && Number.isFinite(accuracy) && accuracy >= 0 ? Math.round(accuracy * 10) / 10 : null],
    ['gps_age_s', typeof sampledAt === 'number' && Number.isFinite(sampledAt) ? Math.max(0, Math.round((snapshot.now - sampledAt) / 1000)) : null],
    ['app_version', clean(snapshot.app.version)],
    ['build', clean(snapshot.app.build)],
    ['update_id', clean(snapshot.updates.updateId)],
    ['channel', clean(snapshot.updates.channel)],
    ['runtime_version', clean(snapshot.updates.runtimeVersion)],
    ['is_embedded_launch', snapshot.updates.isEmbeddedLaunch ?? null],
    ['device_model', clean(snapshot.device.modelName)],
    ['os_name', clean(snapshot.device.osName)],
    ['os_version', clean(snapshot.device.osVersion)],
    ['username', clean(snapshot.player?.username) ?? clean(snapshot.player?.screen_name)],
    ['is_dev', snapshot.isDev],
  ];
  return Object.fromEntries(entries.filter(([, value]) => value !== null && value !== undefined)) as Record<string, string | number | boolean>;
}

export type FeedbackRequest = {
  readonly note?: string;
  readonly trigger: FeedbackTrigger;
  readonly screenshot?: string;
  readonly context: Record<string, string | number | boolean>;
  readonly logs: readonly LogLine[];
};

/** The POST /me/feedback body, or null when there is nothing to send. */
export function feedbackRequest({ note, screenshot, includeScreenshot, trigger, snapshot, logs }: {
  readonly note: string;
  readonly screenshot: string | null;
  readonly includeScreenshot: boolean;
  readonly trigger: FeedbackTrigger;
  readonly snapshot: FeedbackSnapshot;
  readonly logs: readonly LogLine[];
}): FeedbackRequest | null {
  const text = note.trim().slice(0, NOTE_MAX);
  const shot = includeScreenshot && screenshot ? screenshot : null;
  if (!text && !shot) return null;
  return {
    ...(text ? { note: text } : {}),
    trigger,
    ...(shot ? { screenshot: shot } : {}),
    context: feedbackContext(snapshot),
    logs: logs.slice(-50),
  };
}
