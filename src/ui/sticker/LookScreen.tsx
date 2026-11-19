/**
 * LookScreen: the frame a live screen sits in while the app moves onto the Sticker Book kit
 * (DIRECTION.md migration steps 1 and 2: "They first draw today's look, so screens can move onto
 * them with no visible change").
 *
 * Switch off (look.ts, the default): it draws today's Wrapper (the footer bar) and today's Topbar
 * with its three columns, exactly the tree the screen drew by hand before it moved, and hands the
 * body the screen's own top and bottom numbers (`legacyPad`) through `useScreenPad()`.
 * Switch on: it draws the kit's Screen with the in-flow Header (straight edge, nothing under it at
 * rest) and the kit's Footer, and `useScreenPad()` hands the body the kit's room instead (12 pt
 * under the bar, `footerContentBottom` over the footer). So the body's top and bottom room is
 * decided here, in one place, and each moved screen only reads it.
 *
 * The header's pieces are the same in both looks: the screen's own left and right nodes (its back
 * arrow, its "?", its notification bell) and its title. LookBackButton and the "?"
 * (InformationModal) switch their own art; their handlers, navigation, sounds, labels and testIDs
 * never change.
 */
import { createContext, useContext, useRef, type ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Broadcasts from '../../components/Broadcasts';
import Topbar, { BackButton } from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import TopbarText from '../../components/Topbar/TopbarText';
import Wrapper, { useFooterTabs } from '../../components/Wrapper';
import { ThemeContext } from '../../context/ThemeProvider';
import { SoundEffectContext, type SoundEffectContextType } from '../../context/SoundEffectProvider';
import * as RootNavigation from '../../RootNavigation';
import RoundButton from './RoundButton';
import Screen, { screenBodyPadding } from './Screen';
import { useStickerLook } from './look';
import { HEADER } from './tokens';

export type ScreenPad = {
  /** Where the body starts under the bar (today: the screen's own number, often 0 or a small tuck). */
  readonly top: number;
  /** The room the body leaves above the footer or the home bar. */
  readonly bottom: number;
  /** True when the Sticker Book look is drawn. */
  readonly sticker: boolean;
};

const PadContext = createContext<ScreenPad | null>(null);

/** The body's room on the LookScreen above (both looks). */
export function useScreenPad(): ScreenPad {
  return useContext(PadContext) ?? { top: 0, bottom: 0, sticker: false };
}

export type LookHeader = {
  /** The title (today's TopbarText; the kit's one-line fitted title). */
  readonly title?: string | null;
  /** The left column (a LookBackButton, a bell). Leave both sides out for today's single stretched title column. */
  readonly left?: ReactNode;
  /** The right column (InformationModal, a settings cog, a spacer). */
  readonly right?: ReactNode;
  /** The Shark Shop's purple bar. */
  readonly purple?: boolean;
  /** The Secret Shop at midnight. */
  readonly night?: boolean;
};

export type LookScreenProps = {
  readonly header?: LookHeader;
  /** Today's 5-icon footer (Wrapper); `previewMode` and `onNavigate` as Wrapper takes them. */
  readonly footer?: boolean | { readonly previewMode?: boolean; readonly onNavigate?: (screen: string) => void };
  /** The screen's own hand numbers from before it moved (today's look only; deleted at the flip). */
  readonly legacyPad?: { readonly top?: number; readonly bottom?: number };
  /** The kit Screen's testID (sticker look only; today's tree had none). */
  readonly testID?: string;
  readonly children?: ReactNode;
};

/** Pure: the body's room in each look (tested). */
export function lookPad(sticker: boolean, hasHeader: boolean, hasFooter: boolean, legacy: LookScreenProps['legacyPad'], insetTop: number, insetBottom: number, width: number): ScreenPad {
  if (!sticker) return { top: legacy?.top ?? 0, bottom: legacy?.bottom ?? 0, sticker };
  const pad = screenBodyPadding(hasHeader, hasFooter ? 'footer' : 'none', insetTop, insetBottom, width);
  return { top: pad.top, bottom: pad.bottom, sticker };
}

function TodayBar({ header }: { readonly header: LookHeader }) {
  const { title, left, right, purple = false, night = false } = header;
  const single = left === undefined && right === undefined;
  return (
    <Topbar purple={purple} night={night}>
      {single ? (
        <TopbarColumn stretch>
          <TopbarText>{title}</TopbarText>
        </TopbarColumn>
      ) : (
        <>
          <TopbarColumn stretch={false}>{left}</TopbarColumn>
          <TopbarColumn>{title != null ? <TopbarText>{title}</TopbarText> : null}</TopbarColumn>
          <TopbarColumn stretch={false}>{right}</TopbarColumn>
        </>
      )}
    </Topbar>
  );
}

function StickerLookScreen({ header, footer, testID, children }: LookScreenProps) {
  const { theme } = useContext(ThemeContext);
  const nav = typeof footer === 'object' ? footer : {};
  const tabs = useFooterTabs({ previewMode: nav.previewMode, onNavigate: nav.onNavigate });
  const variant = header?.night ? 'night' : header?.purple ? 'purple' : 'water';
  const topArt = !header?.purple && theme?.top_bar_url ? { uri: theme.top_bar_url } : undefined;
  const footArt = theme?.bottom_bar_url ? { uri: theme.bottom_bar_url } : undefined;
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
      header={header ? { title: header.title ?? undefined, left: header.left ?? undefined, right: header.right ?? undefined, variant, art: topArt, broadcast: <Broadcasts /> } : undefined}
      footer={footer ? { items, picked: tabs.topRoute, onPick, art: footArt } : undefined}>
      {children}
    </Screen>
  );
}

export default function LookScreen(props: LookScreenProps) {
  const sticker = useStickerLook();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { header, footer, legacyPad, children } = props;
  const pad = lookPad(sticker, !!header, !!footer, legacyPad, insets.top, insets.bottom, width);
  if (sticker) {
    return <PadContext.Provider value={pad}><StickerLookScreen {...props} /></PadContext.Provider>;
  }
  const nav = typeof footer === 'object' ? footer : {};
  const body = (
    <>
      {header ? <TodayBar header={header} /> : null}
      {children}
    </>
  );
  return (
    <PadContext.Provider value={pad}>
      {footer ? <Wrapper previewMode={nav.previewMode} onNavigate={nav.onNavigate}>{body}</Wrapper> : body}
    </PadContext.Provider>
  );
}

/**
 * The back arrow. Today's look: today's red arrow (BackButton). The Sticker Book look: Alex's
 * blue arrow disc, with today's press: the button sound, the screen's own onPress, then back.
 */
export function LookBackButton({ onPress }: { readonly onPress?: () => void | Promise<void> }) {
  const sticker = useStickerLook();
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const busy = useRef(false);
  if (!sticker) return <BackButton onPress={onPress} />;
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

/** The "?" disc size in the Sticker Book header (InformationModal draws it). */
export const LOOK_HELP_SIZE = HEADER.round;
