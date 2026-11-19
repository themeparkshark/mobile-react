/**
 * Screen: the frame every kit screen sits in, and the only part (with World and MapGround) that
 * sets level 1. It owns the ground (the blue world, a picture such as Alex's shelf room, or the
 * map), lays the Header out in flow at the top and the Footer (or a wave foot band) in flow at the
 * bottom, and gives the body a scroll view whose padding comes from the part, not the screen. So a
 * fixed bar always takes its own space, content starts clear of it, and nothing a player needs
 * sits under it at rest (Dustin, Nov 19). Pages reserve their own rise, so the screen adds nothing.
 *
 * It also mounts the one LayerHost (sheets and dialogs; with a chips bar the scrim starts under the
 * bar so prizes can fly to the chips, with a title bar it covers the bar) and the Toast host, and
 * counts gold primaries (one per screen, dev warning on a second).
 */
import { memo, useSyncExternalStore, type ReactNode } from 'react';
import { Image, ScrollView, StyleSheet, View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Footer, { type FooterProps } from './Footer';
import Header, { type HeaderProps } from './Header';
import LayerHost from './Overlay';
import { ToastHost } from './Toast';
import WaveFoot from './WaveFoot';
import { FrameProvider, Ground, PrimaryScopeProvider } from './StickerContext';
import { stickerLayers } from './layers';
import { footerHeight, headerHeight, screenFrameWidth } from './layout';
import { HEADER, INK, SPACE } from './tokens';

export type ScreenGround = 'world' | 'map' | { readonly image: ImageSourcePropType };

export type ScreenProps = {
  readonly header?: HeaderProps;
  readonly footer?: FooterProps;
  /** A wave foot band across the screen's bottom instead of the footer (the win card's NEXT COIN). */
  readonly foot?: { readonly height: number; readonly children: ReactNode };
  /** The blue world (default), a picture filling the screen, or the map (the caller draws the map behind with `mapLayer`). */
  readonly ground?: ScreenGround;
  /** Map screens: the map itself, drawn full screen behind the bars (it is the ground, never content). */
  readonly mapLayer?: ReactNode;
  /** The body scrolls (default). Map screens place their pieces in a fixed body instead. */
  readonly scroll?: boolean;
  /**
   * Things in flight over every bar (a prize flying from the card to its header chip), drawn above
   * the header, the body and the footer and never taking a touch. Nothing rests here.
   */
  readonly fx?: ReactNode;
  readonly testID?: string;
  readonly children?: ReactNode;
};

/** The body's padding from the parts: the gap under the bar (or under the status bar), the gap over the footer (or the home bar). */
export function screenBodyPadding(hasHeader: boolean, hasBottom: boolean, insetTop: number, insetBottom: number) {
  return {
    top: hasHeader ? HEADER.gap : insetTop + HEADER.gap,
    bottom: hasBottom ? HEADER.gap : Math.max(insetBottom, SPACE.margin) + HEADER.gap,
  };
}

function ScreenImpl({ header, footer, foot, ground = 'world', mapLayer, scroll = true, fx, testID, children }: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const layerUp = useSyncExternalStore(stickerLayers.subscribe, () => stickerLayers.count() > 0);
  const pad = screenBodyPadding(!!header, !!footer || !!foot, insets.top, insets.bottom);
  const keepBar = !!header && !header.title;
  const barH = header ? headerHeight(insets.top) : 0;
  const level = ground === 'map' ? 'map' : 'world';
  const body = scroll ? (
    <ScrollView style={styles.fill} contentContainerStyle={{ paddingTop: pad.top, paddingBottom: pad.bottom, paddingHorizontal: SPACE.margin }}
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, { paddingTop: pad.top, paddingBottom: pad.bottom, paddingHorizontal: SPACE.margin }]} pointerEvents="box-none">{children}</View>
  );
  return (
    <View style={[styles.fill, { backgroundColor: INK.blue }]} testID={testID}>
      {ground === 'world' ? <LinearGradient colors={[INK.blueBright, INK.blue]} style={StyleSheet.absoluteFill} /> : null}
      {typeof ground === 'object' ? <Image source={ground.image} resizeMode="cover" fadeDuration={0} style={[StyleSheet.absoluteFill, { width, height: '100%' }]} /> : null}
      {ground === 'map' ? <View style={StyleSheet.absoluteFill}>{mapLayer}</View> : null}
      <PrimaryScopeProvider name="screen">
        <FrameProvider width={screenFrameWidth(width)}>
          <Ground level={level}>
            {header ? <Header {...header} inert={layerUp || header.inert} /> : null}
            <View style={styles.fill}>
              {body}
              <ToastHost />
            </View>
            {footer ? <Footer {...footer} inert={layerUp || footer.inert} /> : null}
            {foot ? <WaveFoot width={width} height={foot.height + insets.bottom} padBottom={Math.max(insets.bottom, SPACE.base * 2)}>{foot.children}</WaveFoot> : null}
            {fx ? <View style={StyleSheet.absoluteFill} pointerEvents="none" accessible={false} importantForAccessibility="no-hide-descendants">{fx}</View> : null}
            {/* With a chips bar the scrim starts under the bar (prizes fly to the chips); with a title bar it covers the bar too. */}
            <View style={[StyleSheet.absoluteFill, { top: keepBar ? barH : 0 }]} pointerEvents="box-none">
              <LayerHost top={keepBar ? HEADER.gap : barH + HEADER.gap} />
            </View>
          </Ground>
        </FrameProvider>
      </PrimaryScopeProvider>
    </View>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });

const Screen = memo(ScreenImpl);
export default Screen;

/** For map screens: where a piece must end above the screen's bottom so the footer never covers it. */
export { footerHeight };
