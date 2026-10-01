/**
 * Hermes-safe errors.
 *
 * On Hermes (React Native 0.76+), `stack` is an accessor on Error.prototype
 * that throws "Error.stack getter called with an invalid receiver" when the
 * object was not built by the Error constructor. axios 0.27's AxiosError (and
 * CanceledError) are exactly that: `Error.call(this)` plus
 * `Object.create(Error.prototype)`. Anything that then reads `error.stack`
 * throws instead of reading undefined:
 *  - dev: React Native's unhandled-rejection tracker, which turned every
 *    uncaught API failure into a red "Uncaught Error" screen;
 *  - release: our telemetry's rejection and global handlers once a Sentry DSN
 *    is set, where the throw would lose the report and escape the handler.
 *
 * `withOwnStack` gives such an object its own plain `stack` data property,
 * which shadows the throwing prototype getter. `readStack` reads a stack from
 * anything without ever throwing.
 */

/** The stack as a string, or undefined. Never throws. */
export function readStack(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') return undefined;
  try {
    const stack = (value as { stack?: unknown }).stack;
    return typeof stack === 'string' ? stack : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Make `error.stack` safe to read. Real errors and non-objects pass through
 * untouched; an Error-like object whose `stack` read throws gets an own stack
 * ("AxiosError: Request failed with status code 500" plus the current frames).
 */
export function withOwnStack<T>(error: T): T {
  if (!error || typeof error !== 'object') return error;
  if (Object.prototype.hasOwnProperty.call(error, 'stack')) return error;
  try {
    void (error as { stack?: unknown }).stack;
    return error;
  } catch {
    // Falls through: the prototype getter rejected this receiver.
  }
  const named = error as { name?: unknown; message?: unknown };
  const head = `${typeof named.name === 'string' ? named.name : 'Error'}: ${typeof named.message === 'string' ? named.message : ''}`;
  const frames = readStack(new Error(head))?.split('\n').slice(1).join('\n');
  try {
    Object.defineProperty(error, 'stack', {
      value: frames ? `${head}\n${frames}` : head,
      writable: true, configurable: true, enumerable: false,
    });
  } catch {
    // A frozen object keeps its getter; readStack still protects readers.
  }
  return error;
}
