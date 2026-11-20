/**
 * LookSticker: the Sticker Book half of LookScreen, required only when the look is on (look.ts).
 * The kit's Screen with its in-flow Header and Footer, and the bar's discs, all wired to today's
 * handlers: the footer's taps go through Wrapper's own useFooterTabs (the Standings warm-up, the
 * Profile badge, permissions, the tab-reselect scroll, the catch guard); the back disc plays
 * today's sound, runs the screen's onPress, then goes back.
 */
import { useContext, useRef, type ReactNode } from 'react';
import { View, useWindowDimensions, type ImageSourcePropType } from 'react-native';
import Broadcasts from '../../components/Broadcasts';
import { useFooterTabs } from '../../components/Wrapper';
import { ThemeContext } from '../../context/ThemeProvider';
import { SoundEffectContext, type SoundEffectContextType } from '../../context/SoundEffectProvider';
import * as RootNavigation from '../../RootNavigation';
import RoundButton from './RoundButton';
import Header, { type HeaderProps } from './Header';
import Screen, { screenBodyPadding } from './Screen';
import { footerBand } from './layout';
import { FOOTER, HEADER } from './tokens';
import type { LookFooter, LookHeader } from './LookScreen';

/**
 * The kit's body room on a moved screen. The body ends where the footer's band starts (its wave
 * crest), as today's body ends at today's bar, so a list's last row and a docked card (the
 * Standings "you" card) never sit under the band; only the room for the hump and the raised Map
 * icon (FOOTER.rise) and the standard gap are left to the body's own padding.
 */
export function stickerPad(hasHeader: boolean, hasFooter: boolean, insetTop: number, insetBottom: number, width: number) {
  const kit = screenBodyPadding(hasHeader, hasFooter ? 'footer' : 'none', insetTop, insetBottom, width);
  return hasFooter ? { top: kit.top, bottom: FOOTER.rise + HEADER.gap } : kit;
}

/** The kit Header's props for a LookHeader (the theme's bar art, the purple and night bars, Broadcasts). */
function useKitHeader(header: LookHeader | undefined): HeaderProps | undefined {
  const { theme } = useContext(ThemeContext);
  if (!header) return undefined;
  const variant = header.night ? 'night' : header.purple ? 'purple' : 'water';
  const art = !header.purple && theme?.top_bar_url ? { uri: theme.top_bar_url } : undefined;
  return { title: header.title ?? undefined, left: header.left ?? undefined, right: header.right ?? undefined, variant, art, broadcast: <Broadcasts /> };
}

/** The kit Header drawn where the screen draws its bar (a bar inside the Shark Shop's folding stack). */
export function StickerBar({ header }: { readonly header: LookHeader }) {
  const props = useKitHeader(header);
  return props ? <Header {...props} /> : null;
}

export function StickerLookScreen({ header, footer, testID, children }: {
  readonly header?: LookHeader;
  readonly footer?: LookFooter;
  readonly testID?: string;
  readonly children?: ReactNode;
}) {
  const { theme } = useContext(ThemeContext);
  const nav = typeof footer === 'object' ? footer : {};
  const tabs = useFooterTabs({ previewMode: nav.previewMode, onNavigate: nav.onNavigate });
  const kitHeader = useKitHeader(header);
  const footArt = theme?.bottom_bar_url ? { uri: theme.bottom_bar_url } : undefined;
  const { width } = useWindowDimensions();
  const items = tabs.items.map(item => ({
    key: item.screen,
    label: item.text,
    badge: item.text === 'Profile' && tabs.notificationCount > 0 ? tabs.notificationCount : undefined,
    badgeNoun: 'new notifications',
  }));
  const onPick = (key: string) => {
    const item = tabs.items.find(i => i.screen === key);
    if (!item) return;
    tabs.playSound(item.sound);
    tabs.goTo(item);
  };
  return (
    <Screen testID={testID} scroll={false} list
      header={kitHeader}
      footer={footer ? { items, picked: tabs.topRoute, onPick, art: footArt } : undefined}>
      {footer ? <View style={{ flex: 1, marginBottom: footerBand(width) }}>{children}</View> : children}
    </Screen>
  );
}

/** Alex's blue arrow disc with today's back press (sound, the screen's onPress, then back). */
export function StickerBack({ onPress }: { readonly onPress?: () => unknown }) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const busy = useRef(false);
  const press = async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      playSound(require('../../../assets/sounds/button_press.mp3'));
      if (onPress) await onPress();
      RootNavigation.goBack();
    } finally {
      busy.current = false;
    }
  };
  return <RoundButton kind="back" accessibilityLabel="Back" size={HEADER.round} onPress={() => { void press(); }} />;
}

/** Alex's "?" disc (InformationModal's press and label). */
export function StickerHelp({ accessibilityLabel, onPress }: { readonly accessibilityLabel: string; readonly onPress: () => void }) {
  return <RoundButton kind="help" accessibilityLabel={accessibilityLabel} size={HEADER.round} onPress={onPress} />;
}

/** Alex's blank disc with a picture on it (Profile's bell and cog), with the count badge. */
export function StickerIcon({ art, accessibilityLabel, onPress, count, noun }: {
  readonly art: ImageSourcePropType;
  /** The words without the count: the part adds the count and the noun ("Notifications, 3 new"). */
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  readonly count?: number;
  readonly noun?: string;
}) {
  return <RoundButton kind="base" art={art} accessibilityLabel={accessibilityLabel} badgeNoun={noun} size={HEADER.round} badge={count && count > 0 ? count : undefined} onPress={onPress} />;
}
