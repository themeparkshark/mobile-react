/**
 * GameDialog model (WS0 UI kit): pure queue and button logic, no React.
 *
 * The imperative API mirrors Alert.alert so every call site can swap with a
 * one-line change:
 *
 *   Alert.alert('Leave the line?', 'Your progress is saved.', [
 *     { text: 'Stay', style: 'cancel' },
 *     { text: 'Leave', style: 'destructive', onPress: leave },
 *   ]);
 *   // becomes
 *   gameAlert('Leave the line?', 'Your progress is saved.', [...same buttons]);
 *
 * Requests are queued, one dialog at a time. When no <GameDialogHost> is
 * mounted the request falls back to the native Alert, so adopting the API can
 * never lose a prompt.
 */
import type { GameIconName } from './iconNames';
import type { GameButtonVariant } from './tokens';

export type GameDialogButton = {
  readonly text: string;
  readonly style?: 'default' | 'cancel' | 'destructive';
  readonly onPress?: () => void;
  /** Override the automatic button styling. */
  readonly variant?: GameButtonVariant;
};

export type GameDialogOptions = {
  readonly title: string;
  readonly message?: string;
  readonly icon?: GameIconName;
  readonly buttons?: readonly GameDialogButton[];
  /** Tapping the scrim or the Android back button picks the cancel button. Default true when one exists. */
  readonly dismissible?: boolean;
  readonly haptic?: 'warning' | 'success' | 'none';
};

export type DialogAction = GameDialogButton & { readonly index: number; readonly variant: GameButtonVariant };

export type DialogRequest = GameDialogOptions & {
  readonly id: number;
  readonly resolve: (index: number | null) => void;
};

const OK: GameDialogButton = { text: 'OK' };

/**
 * Buttons in display order (top to bottom): the main action first as the gold
 * primary, a destructive action as the red danger button, other actions as
 * blue secondaries, and cancel last as a quiet ghost button.
 */
export function layoutActions(buttons: readonly GameDialogButton[] | undefined): DialogAction[] {
  const list = buttons && buttons.length ? buttons : [OK];
  const indexed = list.map((button, index) => ({ ...button, index }));
  const cancel = indexed.filter(button => button.style === 'cancel');
  const rest = indexed.filter(button => button.style !== 'cancel');
  const primaryIndex = rest.length ? rest[rest.length - 1].index : -1;
  const ordered = [...rest].sort((a, b) => (a.index === primaryIndex ? -1 : b.index === primaryIndex ? 1 : a.index - b.index));
  return [
    ...ordered.map(button => ({
      ...button,
      variant: button.variant ?? (button.style === 'destructive' ? 'danger'
        : button.index === primaryIndex ? 'primary' : 'secondary') as GameButtonVariant,
    })),
    ...cancel.map(button => ({
      ...button,
      variant: button.variant ?? (rest.length ? 'ghost' : 'primary') as GameButtonVariant,
    })),
  ];
}

/** The button chosen by a scrim tap or Android back, or null when the dialog must be answered. */
export function dismissAction(request: GameDialogOptions): number | null {
  if (request.dismissible === false) return null;
  const buttons = request.buttons && request.buttons.length ? request.buttons : [OK];
  const cancel = buttons.findIndex(button => button.style === 'cancel');
  if (cancel >= 0) return cancel;
  return buttons.length === 1 ? 0 : null;
}

type Listener = (current: DialogRequest | null) => void;
type NativeFallback = (title: string, message: string | undefined, buttons: GameDialogButton[]) => void;

export function createDialogStore(nativeFallback: NativeFallback) {
  const queue: DialogRequest[] = [];
  const hosts: Listener[] = [];
  let nextId = 1;

  const current = () => queue[0] ?? null;
  const notify = () => { const host = hosts[hosts.length - 1]; host?.(current()); };

  function show(options: GameDialogOptions): Promise<number | null> {
    return new Promise(resolve => {
      if (!hosts.length) {
        const buttons = (options.buttons && options.buttons.length ? options.buttons : [OK]).map((button, index) => ({
          ...button,
          onPress: () => { resolve(index); button.onPress?.(); },
        }));
        nativeFallback(options.title, options.message, buttons);
        return;
      }
      queue.push({ ...options, id: nextId++, resolve });
      if (queue.length === 1) notify();
    });
  }

  /** Called by the host after the close animation for the current request. */
  function answer(id: number, index: number | null) {
    const request = queue[0];
    if (!request || request.id !== id) return;
    queue.shift();
    const buttons = request.buttons && request.buttons.length ? request.buttons : [OK];
    request.resolve(index);
    if (index !== null) {
      try { buttons[index]?.onPress?.(); } catch (error) { console.error('GameDialog action failed', error); }
    }
    notify();
  }

  function attach(listener: Listener) {
    hosts.push(listener);
    listener(current());
    return () => {
      const at = hosts.lastIndexOf(listener);
      if (at >= 0) hosts.splice(at, 1);
      notify();
    };
  }

  return { show, answer, attach, pending: () => queue.length, hostCount: () => hosts.length };
}
