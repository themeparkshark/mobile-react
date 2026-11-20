/**
 * LookScreen: the frame a live screen sits in while the app moves onto the Sticker Book kit
 * (DIRECTION.md migration steps 1 and 2: "They first draw today's look, so screens can move onto
 * them with no visible change").
 *
 * Switch off (look.ts, the default): it draws today's Wrapper (the footer bar) and today's Topbar
 * with its three columns, exactly the tree the screen drew by hand before it moved, and hands the
 * body the screen's own top and bottom numbers from before (`legacyPad`). The kit is never loaded:
 * this file imports only today's components and the switch, and requires ./LookSticker (the kit's
 * Screen, Header, Footer, RoundButton, CurrencyChip) only when the look is on.
 * Switch on: the kit's Screen with the in-flow Header (straight edge, nothing under it at rest) and
 * the kit's Footer, and the body gets the kit's room instead (12 pt under the bar,
 * `footerContentBottom` over the footer). So the body's top and bottom room is decided here, in
 * one place, and each moved screen only reads it (`children` as a function, or `useScreenPad()`).
 *
 * The header's pieces have the same handlers in both looks: LookBackButton, LookIconButton and the
 * "?" (InformationModal) switch only their art; navigation, sounds, labels and testIDs never change.
 */
import { createContext, useContext, type ReactNode } from 'react';
import { useWindowDimensions, type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Button from '../../components/Button';
import Topbar, { BackButton } from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import TopbarText from '../../components/Topbar/TopbarText';
import Wrapper from '../../components/Wrapper';
import { useStickerLook } from './look';

export type ScreenPad = {
  /** Where the body starts under the bar (today: the screen's own number; on: the kit's gap). */
  readonly top: number;
  /** The room the body leaves above the footer or the home bar. */
  readonly bottom: number;
  /** True when the Sticker Book look is drawn. */
  readonly sticker: boolean;
};

const PadContext = createContext<ScreenPad | null>(null);

/** The body's room on the LookScreen above (both looks), for bodies drawn by a child component. */
export function useScreenPad(): ScreenPad {
  return useContext(PadContext) ?? { top: 0, bottom: 0, sticker: false };
}

/**
 * A body drawn by a child component (a shop shelf, a tab's list): its own bottom number from before
 * with the look off, the LookScreen's room over the kit footer with it on.
 */
export function useLookBottom(legacy: number): number {
  const pad = useScreenPad();
  return pad.sticker ? pad.bottom : legacy;
}

export type LookHeader = {
  /** The title (today's TopbarText, drawn even while undefined as today; null draws no title at all). */
  readonly title?: string | null;
  /** The left column (a LookBackButton, a LookIconButton). Leave both sides out for today's single stretched title column. */
  readonly left?: ReactNode;
  /** The right column (InformationModal, a LookIconButton, a spacer). */
  readonly right?: ReactNode;
  /** The Shark Shop's purple bar. */
  readonly purple?: boolean;
  /** The Secret Shop at midnight. */
  readonly night?: boolean;
};

export type LookFooter = boolean | { readonly previewMode?: boolean; readonly onNavigate?: (screen: string) => void };

export type LookScreenProps = {
  readonly header?: LookHeader;
  /** Today's 5-icon footer (Wrapper); `previewMode` and `onNavigate` as Wrapper takes them. */
  readonly footer?: LookFooter;
  /** The screen's own numbers from before it moved (today's look only; deleted at the flip). */
  readonly legacyPad?: { readonly top?: number; readonly bottom?: number };
  /** What the screen drew before its bar (a sheet host), kept first in both looks so nothing changes order. */
  readonly before?: ReactNode;
  /** The kit Screen's testID (sticker look only; today's tree had none). */
  readonly testID?: string;
  readonly children?: ReactNode | ((pad: ScreenPad) => ReactNode);
};

/** The kit half, loaded only when the look is on (production never evaluates it). */
type StickerHalf = typeof import('./LookSticker');
function sticker(): StickerHalf {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('./LookSticker') as StickerHalf;
}

/** Pure: the body's room in each look (tested). `kit` is the kit's own padding, asked for only when on. */
export function lookPad(on: boolean, legacy: LookScreenProps['legacyPad'], kit: () => { readonly top: number; readonly bottom: number }): ScreenPad {
  if (!on) return { top: legacy?.top ?? 0, bottom: legacy?.bottom ?? 0, sticker: false };
  const pad = kit();
  return { top: pad.top, bottom: pad.bottom, sticker: true };
}

/** Today's Topbar with today's three columns (or the single stretched title column). */
export function TodayBar({ header }: { readonly header: LookHeader }) {
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
          <TopbarColumn>{title !== null ? <TopbarText>{title}</TopbarText> : null}</TopbarColumn>
          <TopbarColumn stretch={false}>{right}</TopbarColumn>
        </>
      )}
    </Topbar>
  );
}

export default function LookScreen(props: LookScreenProps) {
  const on = useStickerLook();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { header, footer, legacyPad, before, testID, children } = props;
  const pad = lookPad(on, legacyPad, () => sticker().stickerPad(!!header, !!footer, insets.top, insets.bottom, width));
  const body = typeof children === 'function' ? children(pad) : children;
  if (on) {
    const { StickerLookScreen } = sticker();
    return (
      <PadContext.Provider value={pad}>
        <StickerLookScreen header={header} footer={footer} testID={testID}>{before}{body}</StickerLookScreen>
      </PadContext.Provider>
    );
  }
  const nav = typeof footer === 'object' ? footer : {};
  const inner = (
    <>
      {before}
      {header ? <TodayBar header={header} /> : null}
      {body}
    </>
  );
  return (
    <PadContext.Provider value={pad}>
      {footer ? <Wrapper previewMode={nav.previewMode} onNavigate={nav.onNavigate}>{inner}</Wrapper> : inner}
    </PadContext.Provider>
  );
}

/**
 * A bar the screen draws in place (inside its own animated stack, like the Shark Shop's folding
 * title), on a LookScreen with no `header`. Off: today's Topbar. On: the kit's Header.
 */
export function LookBar({ header }: { readonly header: LookHeader }) {
  const on = useStickerLook();
  if (!on) return <TodayBar header={header} />;
  const { StickerBar } = sticker();
  return <StickerBar header={header} />;
}

/**
 * The back arrow. Today's look: today's red arrow (BackButton), untouched. The Sticker Book look:
 * Alex's blue arrow disc with today's press: the button sound, the screen's own onPress, then back.
 */
export function LookBackButton({ onPress }: { readonly onPress?: () => void | Promise<void> }) {
  const on = useStickerLook();
  if (!on) return <BackButton onPress={onPress as (() => void) | undefined} />;
  const { StickerBack } = sticker();
  return <StickerBack onPress={onPress} />;
}

/**
 * A picture button in the bar (Profile's bell and cog). Today's look: today's Button with the 35 pt
 * picture and its red dot. The Sticker Book look: Alex's blank disc with the picture on it and the
 * count badge. Same press, same label.
 */
export function LookIconButton({ art, accessibilityLabel, onPress, dot = false, words, count, noun }: {
  readonly art: ImageSourcePropType;
  /** Today's label, word for word. */
  readonly accessibilityLabel: string;
  readonly onPress: () => void;
  /** Today's red dot. */
  readonly dot?: boolean;
  /** The sticker look's label without the count (the badge part adds the count and `noun`); default today's label. */
  readonly words?: string;
  /** The count the sticker badge shows. */
  readonly count?: number;
  readonly noun?: string;
}) {
  const on = useStickerLook();
  if (on) {
    const { StickerIcon } = sticker();
    return <StickerIcon art={art} accessibilityLabel={words ?? accessibilityLabel} onPress={onPress} count={count} noun={noun} />;
  }
  return (
    <Button onPress={onPress} showRedCircle={dot} accessibilityLabel={accessibilityLabel}>
      <Image style={{ width: 35, height: 35, alignSelf: 'center' }} contentFit="contain" source={art} />
    </Button>
  );
}

/** The "?" in the Sticker Book bar, for InformationModal (null with the look off: it draws today's). */
export function useLookHelp(): null | ((props: { readonly accessibilityLabel: string; readonly onPress: () => void }) => ReactNode) {
  const on = useStickerLook();
  if (!on) return null;
  const { StickerHelp } = sticker();
  return StickerHelp;
}
