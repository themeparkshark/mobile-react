/**
 * One silent retry for a screen's main load (T180). A slow or busy server often answers the second ask:
 * the player sees the shark loader the whole time, and only a second miss shows the designed
 * "didn't load" card with its one button. A refusal (a 4xx) is not retried: asking again cannot help.
 */
export const QUIET_RETRY_MS = 1500;

type Failure = { response?: { status?: number } } | null | undefined;

export function worthRetrying(error: unknown): boolean {
  const status = (error as Failure)?.response?.status;
  return !(typeof status === 'number' && status >= 400 && status < 500 && status !== 408 && status !== 429);
}

export async function quietRetry<T>(load: () => Promise<T>, wait: (ms: number) => Promise<unknown> = ms => new Promise(resolve => setTimeout(resolve, ms)),
  alive: () => boolean = () => true): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (!worthRetrying(error) || !alive()) throw error;
    await wait(QUIET_RETRY_MS);
    if (!alive()) throw error;
    return load();
  }
}
