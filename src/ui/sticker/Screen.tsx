/**
 * Screen: the frame every kit screen sits in, and the only part (with World and MapGround) that
 * sets level 1. It owns the ground (the blue world, a picture such as Alex's shelf room, or the
 * map), lays the Header out in flow at the top, and gives the body padding that comes from the
 * parts, not the screen. So a fixed bar always takes its own space, content starts clear of it,
 * and nothing a player needs sits under it at rest (Dustin, Nov 19). Pages reserve their own rise.
 *
 * The Footer sits over the body's bottom (as today's Wrapper): the body runs to the screen's
 * bottom with `footerContentBottom` of padding, so at rest everything ends clear of the wave, and
 * scrolled content passes under the wave itself, never under an invisible straight line above it.
 * A wave foot band (the win card's NEXT COIN) sits in flow and grows with what it holds.
 *
 * It also mounts the Screen's LayerHost and Toast host (they draw only while this screen has
 * navigation focus; layers.ts), hides the header, the body and the footer from VoiceOver while a
 * layer is up, and counts gold primaries and kinds of white edge per screen (dev warnings).
 * `useScreenInsets()` hands map layers and list bodies the bars' room.
 */
import { createContext, memo, useContext, useEffect, useMemo, useSyncExternalStore, type ReactElement, type ReactNode, type Ref } from 'react';
import { Image, ScrollView, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { NavigationRouteContext } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Footer, { type FooterProps } from './Footer';
import Header, { type HeaderProps } from './Header';
import LayerHost, { useHostSlot } from './Overlay';
import { ToastHost } from './Toast';
import WaveFoot from './WaveFoot';
import { FrameProvider, Ground, PrimaryScopeProvider } from './StickerContext';
import { stickerLayers } from './layers';
import { footerContentBottom, footerHeight, headerHeight, mapAttributionBottom, screenFrameWidth } from './layout';
import { primaryKey } from './level';
import { HEADER, INK, LAYER, SPACE, WAVE } from './tokens';

export type ScreenGround = 'world' | 'map' | { readonly image: ImageSourcePropType };

/** The bars' room, for map layers (attribution, logo) and list bodies (content padding, indicator insets). */
export type ScreenInsets = {
  /** From the screen's top to where content starts (the bar and its gap). */
  readonly contentTop: number;
  /** From the screen's bottom to where content must end (the footer's box and its gap, or the home bar). */
  readonly contentBottom: number;
  /** The bar's own height (scroll indicator inset at the top). */
  readonly barTop: number;
  /** The footer's own box (scroll indicator inset at the bottom). */
  readonly barBottom: number;
  /** Where a map's attribution must end above the screen's bottom so the footer's wave never touches it. */
  readonly attribution: number;
};

const InsetsContext = createContext<ScreenInsets | null>(null);

/** The bars' room on the Screen above (zeros outside a Screen). */
export function useScreenInsets(): ScreenInsets {
  return useContext(InsetsContext) ?? { contentTop: 0, contentBottom: 0, barTop: 0, barBottom: 0, attribution: 0 };
}

export type ScreenProps = {
  readonly header?: HeaderProps;
  readonly footer?: FooterProps;
  /** A wave foot band across the screen's bottom instead of the footer (the win card's NEXT COIN). It grows with what it holds. */
  readonly foot?: { readonly children: ReactNode };
  /** The blue world (default), a picture filling the screen, or the map (the caller draws the map behind with `mapLayer`). */
  readonly ground?: ScreenGround;
  /** Map screens: the map itself, drawn full screen behind the bars (the ground, never content). A function gets the bars' room. */
  readonly mapLayer?: ReactNode | ((insets: ScreenInsets) => ReactNode);
  /** The ground dims under the scrim's navy (a win card over the map). The pieces are then level 1 on the world. */
  readonly dim?: boolean;
  /** The body scrolls (default). Map screens place their pieces in a fixed body instead. */
  readonly scroll?: boolean;
  /** A list body: the screen adds no vertical padding; the list takes `useScreenInsets()` as its content padding and indicator insets. */
  readonly list?: boolean;
  /** Pull to refresh on the scrolling body. */
  readonly refreshControl?: ReactElement;
  /** The scrolling body, for scrollTo. */
  readonly scrollRef?: Ref<ScrollView>;
  /**
   * Things in flight over every bar (a prize flying from the card to its header chip), drawn above
   * the header, the body and the footer and never taking a touch. Nothing rests here.
   */
  readonly fx?: ReactNode;
  readonly testID?: string;
  readonly children?: ReactNode;
};

/** The body's padding from the parts: the gap under the bar (or under the status bar), the room over the footer (or the home bar). */
export function screenBodyPadding(hasHeader: boolean, bottom: 'footer' | 'foot' | 'none', insetTop: number, insetBottom: number, width: number) {
  return {
    top: hasHeader ? HEADER.gap : insetTop + HEADER.gap,
    bottom: bottom === 'footer' ? footerContentBottom(width) : bottom === 'foot' ? HEADER.gap : Math.max(insetBottom, SPACE.margin) + HEADER.gap,
  };
}

/** What a part hidden behind a layer takes: out of VoiceOver's reach (the gate's whole point) and out of touch. */
export function behindLayer(up: boolean) {
  return up
    ? { accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, pointerEvents: 'none' as const }
    : { accessibilityElementsHidden: false, importantForAccessibility: 'auto' as const, pointerEvents: 'box-none' as const };
}

function Dim({ on }: { readonly on: boolean }) {
  const o = useSharedValue(0);
  useEffect(() => { o.value = withTiming(on ? 1 : 0, { duration: LAYER.exitMs, easing: Easing.out(Easing.quad) }); }, [o, on]);
  const style = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: INK.scrim }, style]} />;
}

function ScreenImpl({ header, footer, foot, ground = 'world', mapLayer, dim = false, scroll = true, list = false, refreshControl, scrollRef, fx, testID, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const route = useContext(NavigationRouteContext);
  const active = useHostSlot(false);
  const layerUp = useSyncExternalStore(stickerLayers.subscribe, () => stickerLayers.count() > 0);
  const bottomKind = footer ? 'footer' : foot ? 'foot' : 'none';
  const pad = screenBodyPadding(!!header, bottomKind, insets.top, insets.bottom, width);
  const keepBar = !!header && !header.title;
  const barH = header ? headerHeight(insets.top) : 0;
  const level = ground === 'map' && !dim ? 'map' : 'world';
  const room = useMemo<ScreenInsets>(() => ({
    contentTop: barH + pad.top,
    contentBottom: pad.bottom,
    barTop: barH,
    barBottom: footer ? footerHeight(width) : 0,
    attribution: footer ? mapAttributionBottom(width) : Math.max(insets.bottom, SPACE.base * 2),
  }), [barH, footer, insets.bottom, pad.bottom, pad.top, width]);
  const hide = behindLayer(layerUp);
  const scrollInsets = { top: 0, bottom: footer ? footerHeight(width) : 0 };
  const padding = list ? null : { paddingTop: pad.top, paddingBottom: pad.bottom, paddingHorizontal: SPACE.margin };
  const body = scroll && !list ? (
    <ScrollView ref={scrollRef} style={styles.fill} contentContainerStyle={[{ flexGrow: 1 }, padding]} scrollIndicatorInsets={scrollInsets}
      keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets refreshControl={refreshControl}
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, padding]} pointerEvents="box-none">{children}</View>
  );
  const map = typeof mapLayer === 'function' ? mapLayer(room) : mapLayer;
  return (
    <View style={[styles.fill, { backgroundColor: INK.blue }]} testID={testID}>
      {ground === 'world' ? <LinearGradient colors={[INK.blueBright, INK.blue]} style={StyleSheet.absoluteFill} /> : null}
      {typeof ground === 'object' ? <Image source={ground.image} resizeMode="cover" fadeDuration={0} style={[StyleSheet.absoluteFill, { width, height: '100%' }]} /> : null}
      {ground === 'map' ? <View style={StyleSheet.absoluteFill} pointerEvents="box-none">{map}</View> : null}
      {ground === 'map' ? <Dim on={dim} /> : null}
      <InsetsContext.Provider value={room}>
        <PrimaryScopeProvider name={testID ?? route?.name ?? 'screen'} warnKey={primaryKey(route?.name, testID)}>
          <FrameProvider width={screenFrameWidth(width)}>
            <Ground level={level}>
              {header ? <Header {...header} inert={layerUp || header.inert} /> : null}
              <View style={styles.fill} pointerEvents="box-none">
                <View style={styles.fill} accessibilityElementsHidden={hide.accessibilityElementsHidden} importantForAccessibility={hide.importantForAccessibility}
                  pointerEvents={hide.pointerEvents}>
                  {body}
                </View>
                {footer ? (
                  <View style={styles.footer} pointerEvents="box-none">
                    <Footer {...footer} inert={layerUp || footer.inert} />
                  </View>
                ) : null}
                <ToastHost active={active} />
                {/* With a chips bar the scrim starts under the bar (prizes fly to the chips): the host sits under the header in flow. */}
                {keepBar ? <View style={StyleSheet.absoluteFill} pointerEvents="box-none"><LayerHost top={HEADER.gap} active={active} /></View> : null}
              </View>
              {foot ? (
                <View accessibilityElementsHidden={hide.accessibilityElementsHidden} importantForAccessibility={hide.importantForAccessibility} pointerEvents={hide.pointerEvents}>
                  <WaveFoot width={width} height={WAVE.height + insets.bottom} padBottom={Math.max(insets.bottom, SPACE.base * 2)}>{foot.children}</WaveFoot>
                </View>
              ) : null}
              {fx ? <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{fx}</View> : null}
              {/* With a title bar the scrim covers the bar too. */}
              {keepBar ? null : <View style={StyleSheet.absoluteFill} pointerEvents="box-none"><LayerHost top={barH + HEADER.gap} active={active} /></View>}
            </Ground>
          </FrameProvider>
        </PrimaryScopeProvider>
      </InsetsContext.Provider>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0 },
});

const Screen = memo(ScreenImpl);
export default Screen;

/** For map screens: where a piece must end above the screen's bottom so the footer never covers it. */
export { footerHeight };
