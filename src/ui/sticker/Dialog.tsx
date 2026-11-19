/**
 * Dialog: a floating Page with a title label on its top edge, one line, one gold action and the
 * wave foot as the way out (DIRECTION.md kit: Dialog). Two ways to use it:
 *
 * 1. The app's dialog model (src/ui/gameDialogModel): `<Dialog visible request={options} onAnswer={...} />`
 *    or `showStickerDialog(options)` (a promise of the chosen button's index, or null), so the 135
 *    gameAlert calls can move onto it in step 2 without changing their buttons. layoutActions picks
 *    the one gold primary, a destructive action is red, other actions are blue, and the cancel
 *    button is the ghost way out in the wave foot. A short title sits in the label; a sentence-long
 *    one moves onto the page as a heading (dialogTitleLayout).
 * 2. A custom body (the grown-up gate): `<Dialog visible label={{ text, art: 'lock' }} wayOut={...}>...</Dialog>`.
 *
 * Drawn by the one LayerHost, queued, stuck on, peeled off; its body scrolls if it must.
 */
import { memo, type ReactNode } from 'react';
import { View } from 'react-native';
import GhostButton from './GhostButton';
import { stickerLayers } from './layers';
import { useLayer } from './Overlay';
import Page, { type PageLabel } from './Page';
import StickerButton, { type StickerVariant } from './StickerButton';
import { Body, Heading } from './Text';
import type { WayOut } from './Sheet';
import { dialogTitleLayout, dismissAction, layoutActions, type GameDialogOptions } from '../gameDialogModel';
import { SPACE } from './tokens';

/** Which kit variant each dialog action gets. Pure, so it is tested. */
export function dialogVariant(variant: string): StickerVariant {
  switch (variant) {
    case 'primary': return 'primary';
    case 'danger': return 'danger';
    case 'ghost': return 'ghost';
    default: return 'second';
  }
}

/** The dialog's layout from the model: the label or heading, the body buttons and the way out in the foot. Pure. */
export function dialogPlan(request: GameDialogOptions) {
  const actions = layoutActions(request.buttons, request.equalChoices);
  const title = dialogTitleLayout(request.title);
  const ghosts = actions.filter(a => dialogVariant(a.variant) === 'ghost');
  const body = actions.filter(a => dialogVariant(a.variant) !== 'ghost');
  // The wave foot always holds a way out: the cancel ghost, or when there is none, the one action itself.
  const footAction = ghosts[0] ?? (body.length === 1 ? body[0] : null);
  const bodyActions = footAction && !ghosts.length ? [] : body;
  return { title, bodyActions, footAction, extraGhosts: ghosts.slice(1), dismiss: dismissAction(request) };
}

export const DialogModelBody = memo(function DialogModelBody({ request, onAnswer }: { request: GameDialogOptions; onAnswer: (index: number | null) => void }) {
  const plan = dialogPlan(request);
  const foot = plan.footAction;
  const footIsGold = foot ? dialogVariant(foot.variant) !== 'ghost' : false;
  return (
    <Page floating arrive scroll label={plan.title.placement === 'ribbon' ? { text: plan.title.text, large: true } : undefined}
      foot={{ height: footIsGold ? 70 : 58, children: foot ? (footIsGold
        ? <StickerButton label={foot.text} variant={dialogVariant(foot.variant)} size="medium" width={180} image={foot.image} onPress={() => onAnswer(foot.index)} />
        : <GhostButton label={foot.text} onPress={() => onAnswer(foot.index)} />) : null }}>
      {plan.title.placement === 'card' ? <Heading lines={3}>{plan.title.text}</Heading> : null}
      {request.message ? <Body lines={4} style={{ marginTop: plan.title.placement === 'card' ? SPACE.base * 2 : 0 }}>{request.message}</Body> : null}
      {plan.bodyActions.length ? (
        <View style={{ marginTop: SPACE.cardGapLoose, gap: SPACE.cardGap, alignItems: 'center' }}>
          {plan.bodyActions.map(a => (
            <StickerButton key={a.index} label={a.text} variant={dialogVariant(a.variant)} size="medium" width={200} image={a.image} onPress={() => onAnswer(a.index)} />
          ))}
          {plan.extraGhosts.map(a => <GhostButton key={a.index} label={a.text} onPress={() => onAnswer(a.index)} />)}
        </View>
      ) : null}
    </Page>
  );
});

export const DialogCustomBody = memo(function DialogCustomBody({ label, wayOut, children }: { label: PageLabel; wayOut: WayOut; children: ReactNode }) {
  return (
    <Page floating arrive scroll label={label}
      foot={{ height: 58, children: <GhostButton label={wayOut.label} accessibilityLabel={wayOut.accessibilityLabel} art={wayOut.art} onPress={wayOut.onPress} /> }}>
      {children}
    </Page>
  );
});

export type DialogProps =
  | { readonly visible: boolean; readonly request: GameDialogOptions; readonly onAnswer: (index: number | null) => void; readonly testID?: string; readonly label?: undefined; readonly children?: undefined }
  | { readonly visible: boolean; readonly label: PageLabel; readonly wayOut: WayOut; readonly dismissible?: boolean; readonly testID?: string; readonly children: ReactNode; readonly request?: undefined };

function DialogImpl(props: DialogProps) {
  const model = props.request !== undefined;
  const request = props.request;
  const dismiss = request ? dismissAction(request) : null;
  const element = request && props.request
    ? <DialogModelBody request={request} onAnswer={props.onAnswer} />
    : props.label ? <DialogCustomBody label={props.label} wayOut={(props as { wayOut: WayOut }).wayOut}>{props.children}</DialogCustomBody> : null;
  const wayOut = model
    ? (dismiss !== null ? () => (props as { onAnswer: (i: number | null) => void }).onAnswer(dismiss) : undefined)
    : (props as { wayOut: WayOut }).wayOut.onPress;
  useLayer(props.visible, element, { wayOut, dismissible: model ? dismiss !== null : (props as { dismissible?: boolean }).dismissible ?? false, testID: props.testID });
  return null;
}

const Dialog = memo(DialogImpl);
export default Dialog;

/** Imperative: show a model dialog in the kit's host; resolves with the chosen button's index (null when dismissed with no cancel). */
export function showStickerDialog(request: GameDialogOptions): Promise<number | null> {
  return new Promise(resolve => {
    let id = 0;
    const answer = (index: number | null) => { stickerLayers.close(id); resolve(index); };
    const dismiss = dismissAction(request);
    id = stickerLayers.present({
      element: <DialogModelBody request={request} onAnswer={answer} />,
      wayOut: dismiss !== null ? () => answer(dismiss) : undefined,
      dismissible: dismiss !== null,
    });
  });
}
