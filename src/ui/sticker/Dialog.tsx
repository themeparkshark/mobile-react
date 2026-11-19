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
 * Drawn by the active LayerHost, queued, stuck on, peeled off; its body scrolls if it must, and the
 * room avoids the keyboard. The main action is large (58) and full width; nothing is cut: the
 * message and a long title wrap as far as they need. GameDialogOptions' `icon` is drawn as Alex's
 * art above the words (icons.ts), its `haptic` plays when the dialog is presented, and `children`
 * (a model dialog with a field or a picker) sit under the message.
 */
import { memo, useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import { haptic } from '../../gamekit/Haptics';
import GhostButton from './GhostButton';
import Lift from './Lift';
import { iconArt } from './icons';
import { layerHosts, stickerLayers } from './layers';
import { warnOnce } from './level';
import { useLayer } from './Overlay';
import Page, { type PageLabel } from './Page';
import StickerButton, { type StickerVariant } from './StickerButton';
import { Body, Heading } from './Text';
import type { WayOut } from './Sheet';
import { dialogTitleLayout, dismissAction, layoutActions, type GameDialogOptions } from '../gameDialogModel';
import { ART_SIZE, SPACE } from './tokens';

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

export const DialogModelBody = memo(function DialogModelBody({ request, onAnswer, children }: { request: GameDialogOptions; onAnswer: (index: number | null) => void; children?: ReactNode }) {
  const plan = dialogPlan(request);
  const foot = plan.footAction;
  const footIsGold = foot ? dialogVariant(foot.variant) !== 'ghost' : false;
  const art = iconArt(request.icon, `Dialog "${request.title}"`);
  useEffect(() => {
    if (request.haptic === 'warning' || request.haptic === 'success') haptic(request.haptic);
  }, [request.haptic]);
  return (
    <Page floating arrive scroll label={plan.title.placement === 'ribbon' ? { text: plan.title.text, large: true } : undefined}
      foot={{ children: foot ? (footIsGold
        ? <View style={{ alignSelf: 'stretch', paddingHorizontal: SPACE.pagePad }}><StickerButton label={foot.text} variant={dialogVariant(foot.variant)} size="large" fullWidth image={foot.image} icon={foot.icon} onPress={() => onAnswer(foot.index)} /></View>
        : <GhostButton label={foot.text} onPress={() => onAnswer(foot.index)} />) : null }}>
      {art ? <Lift source={art} width={ART_SIZE.prize} height={ART_SIZE.prize} style={{ alignSelf: 'center', marginBottom: SPACE.base * 2 }} /> : null}
      {plan.title.placement === 'card' ? <Heading>{plan.title.text}</Heading> : null}
      {request.message ? <Body style={{ marginTop: plan.title.placement === 'card' ? SPACE.base * 2 : 0 }}>{request.message}</Body> : null}
      {children ? <View style={{ marginTop: SPACE.cardGapLoose }}>{children}</View> : null}
      {plan.bodyActions.length ? (
        <View style={{ marginTop: SPACE.cardGapLoose, gap: SPACE.cardGap, alignSelf: 'stretch' }}>
          {plan.bodyActions.map(a => {
            const v = dialogVariant(a.variant);
            return <StickerButton key={a.index} label={a.text} variant={v} size={v === 'primary' ? 'large' : 'medium'} fullWidth image={a.image} icon={a.icon} onPress={() => onAnswer(a.index)} />;
          })}
          {plan.extraGhosts.map(a => <GhostButton key={a.index} label={a.text} onPress={() => onAnswer(a.index)} />)}
        </View>
      ) : null}
    </Page>
  );
});

export const DialogCustomBody = memo(function DialogCustomBody({ label, wayOut, children }: { label: PageLabel; wayOut: WayOut; children: ReactNode }) {
  return (
    <Page floating arrive scroll label={label}
      foot={{ children: <GhostButton label={wayOut.label} accessibilityLabel={wayOut.accessibilityLabel} art={wayOut.art} onPress={wayOut.onPress} /> }}>
      {children}
    </Page>
  );
});

export type DialogProps =
  | { readonly visible: boolean; readonly request: GameDialogOptions; readonly onAnswer: (index: number | null) => void; readonly testID?: string; readonly label?: undefined; readonly children?: ReactNode }
  | { readonly visible: boolean; readonly label: PageLabel; readonly wayOut: WayOut; readonly dismissible?: boolean; readonly testID?: string; readonly children: ReactNode; readonly request?: undefined };

function DialogImpl(props: DialogProps) {
  const model = props.request !== undefined;
  const request = props.request;
  const dismiss = request ? dismissAction(request) : null;
  const element = request && props.request
    ? <DialogModelBody request={request} onAnswer={props.onAnswer}>{props.children}</DialogModelBody>
    : props.label ? <DialogCustomBody label={props.label} wayOut={(props as { wayOut: WayOut }).wayOut}>{props.children}</DialogCustomBody> : null;
  const wayOut = model
    ? (dismiss !== null ? () => (props as { onAnswer: (i: number | null) => void }).onAnswer(dismiss) : undefined)
    : (props as { wayOut: WayOut }).wayOut.onPress;
  useLayer(props.visible, element, { wayOut, dismissible: model ? dismiss !== null : (props as { dismissible?: boolean }).dismissible ?? false, testID: props.testID });
  return null;
}

const Dialog = memo(DialogImpl);
export default Dialog;

/**
 * Imperative: show a model dialog in the kit's active host; resolves with the chosen button's index
 * (null when dismissed with no cancel). With no kit host in the tree at all it never waits: it
 * resolves at once with the dismiss answer (dev warning), so it can never block the queue.
 */
export function showStickerDialog(request: GameDialogOptions, hosts: { count(): number } = layerHosts): Promise<number | null> {
  if (hosts.count() === 0) {
    warnOnce('dialog-nohost', __DEV__, m => console.warn(m), `showStickerDialog("${request.title}") with no kit host mounted: answered as dismissed. Step 2 mounts StickerRoot above the navigator.`);
    return Promise.resolve(dismissAction(request));
  }
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
