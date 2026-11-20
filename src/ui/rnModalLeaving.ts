/**
 * react-native-modal tells the door when its own leave has started (fix pass w5, lane host, N01 on every sibling).
 *
 * 34 sheets use react-native-modal. It plays its own out animation (300 ms, far longer on a busy phone) and keeps its
 * React Native Modal visible until that ends. A tap that lands on it then was meant for the screen under it, but the
 * door saw a sheet that was still wanted, so the tap died on the sheet's backdrop: the same lost first press the
 * CalmModal cards had (CalmModal and GameDialog pass `leaving` themselves).
 *
 * react-native-modal knows the moment exactly: its isVisible prop is false while its own state still shows the sheet.
 * Its render is wrapped once (iOS, ui/installNativeGuards.ts) to hand that to the door as DoorModal's `leaving` prop,
 * so the tap is kept and pressed on the screen under it once the sheet is gone (ui/tapThrough.ts), never on both.
 * Nothing else about react-native-modal changes, and a version whose render looks different is left alone.
 */
import React from 'react';

/** Pure: react-native-modal is playing its out animation (asked to hide, still on screen). */
export function rnModalLeaving(props: { readonly isVisible?: unknown } | null | undefined, state: { readonly isVisible?: unknown } | null | undefined): boolean {
  return props?.isVisible === false && state?.isVisible === true;
}

type ModalClass = { prototype?: { render?: (this: Instance) => unknown; __tpsLeaving?: boolean } } | null | undefined;
type Instance = { props?: { isVisible?: unknown }; state?: { isVisible?: unknown } };

/** Wrap react-native-modal's render once. Returns whether it did (false: not found, already wrapped, or unknown shape). */
export function installRnModalLeaving(ModalComponent: ModalClass, NativeModal: unknown): boolean {
  const proto = ModalComponent?.prototype;
  if (!proto || typeof proto.render !== 'function' || proto.__tpsLeaving) return false;
  const render = proto.render;
  proto.render = function renderWithLeaving(this: Instance) {
    const out = render.call(this);
    // Only its own Modal element (with coverScreen false it renders a plain View, which has no door).
    if (!React.isValidElement(out) || out.type !== NativeModal || !rnModalLeaving(this.props, this.state)) return out;
    return React.cloneElement(out as React.ReactElement<{ leaving?: boolean }>, { leaving: true });
  };
  proto.__tpsLeaving = true;
  return true;
}
