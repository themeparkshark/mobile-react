/**
 * LayerHost (Overlay): the ONE in-tree host for floating sheets and dialogs, with a queue
 * (layers.ts). No native Modal anywhere in the kit. It draws the front layer only: the navy scrim
 * (52 percent, never black, a tap takes the way out when allowed), and the room the page sits in,
 * between the bar and the bottom inset with the board's 24 pt side margins.
 *
 * The page anchors inside that room: centred when it fits; when it does not, it starts at the
 * room's top (its own rise, the ribbon or the label, is its top margin) and its body scrolls, so it
 * never overflows upward into the bar or down past the wave foot.
 *
 * It is a real modal for assistive tech: accessibilityViewIsModal, VoiceOver's escape and Android's
 * back button take the way out (the wave foot's ghost), and the layer is registered with
 * src/ui/modalLayers so the app's native dialogs and the kit's layers never stack. It arrives
 * stuck on (the Page's arrive) and leaves peeled off; Reduce Motion: 150 ms fades.
 * Inside a page it refuses to mount. When several screens are mounted (a stack), only the newest
 * host draws.
 */
import { memo, useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { BackHandler, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { modalLayers } from '../modalLayers';
import useUiReducedMotion from '../useUiReducedMotion';
import { FrameProvider, PlaceProvider, PrimaryScopeProvider, useRefuseInPage } from './StickerContext';
import { layerHosts, scrimAction, stickerLayers, type LayerQueue } from './layers';
import { layerWidth } from './layout';
import { WORLD } from './level';
import { peelTiming, usePeelStyle } from './motion';
import { INK, LAYER, STICK } from './tokens';

/** Side margin of a floating sheet or dialog (the board: 24 on a 390 phone). */
export const OVERLAY_MARGIN = LAYER.margin;

export type LayerHostProps = {
  /** Where the room starts, from the host's own top (Screen: under the bar). */
  readonly top: number;
  /** Room kept at the bottom (Screen: the footer's box, or the bottom inset). */
  readonly bottom?: number;
  /** The queue it draws (default: the app's one). */
  readonly queue?: LayerQueue;
};

function useFrontLayer(queue: LayerQueue) {
  return useSyncExternalStore(queue.subscribe, queue.front);
}

function LayerHostImpl({ top, bottom, queue = stickerLayers }: LayerHostProps) {
  const refused = useRefuseInPage('LayerHost');
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const reduced = useUiReducedMotion();
  const [hostId] = useState(() => layerHosts.add());
  useEffect(() => () => layerHosts.remove(hostId), [hostId]);
  const active = useSyncExternalStore(layerHosts.subscribe, () => layerHosts.isActive(hostId));
  const front = useFrontLayer(queue);
  const frontId = active && front ? front.id : null;

  // Register the front layer with the app's modal layers; draw it only once it is the oldest layer up.
  const [reg, setReg] = useState<{ layer: number; id: number } | null>(null);
  useEffect(() => {
    if (frontId == null) return undefined;
    const id = modalLayers.add();
    setReg({ layer: frontId, id });
    return () => { modalLayers.remove(id); setReg(null); };
  }, [frontId]);
  const ready = useSyncExternalStore(modalLayers.subscribe, () => (reg != null && reg.layer === frontId ? modalLayers.isFront(reg.id) : false));

  const scrim = useSharedValue(0);
  const out = useSharedValue(0);
  const shown = !!front && ready && !refused;
  useEffect(() => {
    if (!shown) return;
    out.value = 0;
    scrim.value = withTiming(1, { duration: reduced ? STICK.reducedFadeMs : 200, easing: Easing.out(Easing.quad) });
  }, [front?.id, out, reduced, scrim, shown]);

  const finish = useCallback((id: number) => queue.done(id), [queue]);
  const leaving = active && front ? front.leaving : false;
  useEffect(() => {
    if (!leaving || !front) return;
    const id = front.id;
    // Never drawn (another layer was up): nothing to peel, it is simply gone.
    if (!shown) { queue.done(id); return; }
    scrim.value = withTiming(0, { duration: LAYER.exitMs, easing: Easing.in(Easing.quad) });
    out.value = withTiming(1, peelTiming(reduced), done => { if (done) runOnJS(finish)(id); });
  }, [finish, front, leaving, out, queue, reduced, scrim, shown]);

  const wayOut = front?.wayOut;
  useEffect(() => {
    if (!shown) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (!leaving) wayOut?.(); return true; });
    return () => sub.remove();
  }, [leaving, shown, wayOut]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrim.value }));
  const peel = usePeelStyle(out, reduced);
  if (!shown || !front) return null;
  const onScrim = scrimAction(front);
  const sheetWidth = layerWidth(width);
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 50 }]} pointerEvents={leaving ? 'none' : 'box-none'}>
      <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: INK.scrim }, scrimStyle]}>
        <Pressable accessible={false} importantForAccessibility="no" style={{ flex: 1 }} disabled={!onScrim} onPress={onScrim ?? undefined} />
      </Animated.View>
      <View testID={front.testID} accessibilityViewIsModal onAccessibilityEscape={wayOut}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: top, paddingBottom: bottom ?? Math.max(insets.bottom, LAYER.bottom) + 8 }}
        pointerEvents="box-none">
        <Animated.View style={[{ width: sheetWidth, flexShrink: 1 }, peel]} pointerEvents="box-none">
          <PlaceProvider value={WORLD}>
            <FrameProvider width={sheetWidth}>
              <PrimaryScopeProvider name="layer">{front.element}</PrimaryScopeProvider>
            </FrameProvider>
          </PlaceProvider>
        </Animated.View>
      </View>
    </View>
  );
}

const LayerHost = memo(LayerHostImpl);
export default LayerHost;

/**
 * A layer drawn while `visible` (Sheet and Dialog use this): asks the queue when it turns on,
 * hands it new content on every render, and closes it (peeled off) when it turns off or unmounts.
 */
export function useLayer(visible: boolean, element: ReactNode, spec: { wayOut?: () => void; dismissible?: boolean; testID?: string }, queue: LayerQueue = stickerLayers): void {
  const [id, setId] = useState<number | null>(null);
  useEffect(() => {
    if (!visible) return undefined;
    const mine = queue.present({ element: null, ...spec });
    setId(mine);
    return () => { queue.close(mine); setId(null); };
    // The spec and element are handed over below on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, queue]);
  useEffect(() => {
    if (id != null) queue.update(id, { element, ...spec });
  });
}
