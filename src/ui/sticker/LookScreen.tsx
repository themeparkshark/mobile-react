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
import { type ImageSourcePropType } from 'react-native';
import { Image } from 'expo-image';
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

/** The body's room, provided by LookScreen (today's half) and the kit half (LookSticker). */
export const PadContext = createContext<ScreenPad | null>(null);

/** Inside the kit Header's slots: the "?" draws the kit's help disc only there (never inside today's Topbar). */
export const InStickerBar = createContext(false);

/** The body's room on the LookScreen above (both looks), for bodies drawn by a child component. */
export function useScreenPad(): ScreenPad {
  return useContext(PadContext) ?? { top: 0, bottom: 0, sticker: false };
}

/**
 * A body's bottom room over the 5-icon footer: its own number from before with the look off, the
 * LookScreen's room over the kit footer with it on. Inside a LookScreen it reads the screen's room
 * (a shop shelf, a Standings tab). A footer screen that draws its own LookScreen lower in its tree
 * (the Ride Tracker pages, through RideTrackerFrame) reads the kit footer's room directly.
 * So a screen never adds today's footer clearance on top of the kit's.
 */
export function useLookBottom(legacy: number): number {
  const pad = useContext(PadContext);
  const on = useStickerLook();
  if (pad) return pad.sticker ? pad.bottom : legacy;
  return on ? sticker().stickerFooterBottom() : legacy;
}

/**
 * The body's top room on the view that paints the screen's own ground (its colour or art). Off:
 * today's margin (the tuck under today's curved bar). On: padding inside that view, so the
 * screen's own colour or art meets the bar's drop and its content starts the kit's gap below it
 * (no strip of world blue between the bar and the page).
 */
export function lookTop(pad: ScreenPad): { readonly marginTop?: number; readonly paddingTop?: number } {
  return pad.sticker ? { paddingTop: pad.top } : { marginTop: pad.top };
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
  const { header, footer, legacyPad, before, testID, children } = props;
  if (on) {
    // The kit half reads the safe areas and the width itself, so today's look never subscribes to them.
    const { StickerLookScreen } = sticker();
    return <StickerLookScreen header={header} footer={footer} testID={testID} before={before}>{children}</StickerLookScreen>;
  }
  const pad = lookPad(false, legacyPad, () => ({ top: 0, bottom: 0 }));
  const body = typeof children === 'function' ? children(pad) : children;
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
export function LookBackButton({ onPress }: { readonly onPress?: () => unknown }) {
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

/**
 * The "?" in the Sticker Book bar, for InformationModal: only inside the kit Header's slots. Null
 * anywhere else (the look off, today's Topbar on a screen that has not moved, a body), where it
 * draws today's.
 */
export function useLookHelp(): null | ((props: { readonly accessibilityLabel: string; readonly onPress: () => void }) => ReactNode) {
  const inBar = useContext(InStickerBar);
  if (!inBar) return null;
  const { StickerHelp } = sticker();
  return StickerHelp;
}
