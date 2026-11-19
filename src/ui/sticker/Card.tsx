/**
 * Card: cream or white paper. Inside a page (level 2): the navy line, a top highlight, a lip
 * and a 3 pt drop. Straight on the world (level 1): the white cut edge and a 4 pt drop. On the
 * map: the 3 pt line and the 50 percent drop. The card reads its level from where it is mounted;
 * there is no edge prop. Everything inside a card is level 2 on paper.
 *
 * Art hangs off the left or top edge: pass `art` (a chest on a row, a coin). A row of art standing
 * on the top edge (the win card's five prizes in their spots) is `topRow`, sized by an ART_SIZE
 * role. Whatever rises above the card (art, a top row, a title label) is reserved as the card's
 * own top margin (cardTopRise), so what sits above it is never covered and a screen never adds
 * an overhang by hand.
 */
import { memo, type ReactNode } from 'react';
import { StyleSheet, View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import type { AnimatedStyle } from 'react-native-reanimated';
import Arrive from './Arrive';
import Lift from './Lift';
import Shell from './Shell';
import TitleLabel, { type TitleLabelTone } from './TitleLabel';
import { PlaceProvider, useCountEdge, useStickerPlace } from './StickerContext';
import { cardTopRise, labelReach } from './layout';
import { edgeFor, insideCard } from './level';
import type { LayoutStyle } from './style';
import { ART_SIZE, DROP, INK, LINE, RADIUS, SHADE, SPACE } from './tokens';

export type CardArt = {
  readonly source: ImageSourcePropType;
  readonly width: number;
  readonly height: number;
  /** Hang off the left edge (rows) or the top edge (prizes). */
  readonly side?: 'left' | 'top';
  /** How far past the edge, in pt (default 14, as the board). */
  readonly over?: number;
  /** Offset along the edge, in pt. */
  readonly along?: number;
};

/** A title label on the card's top edge (FREE TICKETS). The card reserves its rise and starts its body under it. */
export type CardLabel = { readonly text: string; readonly tone?: TitleLabelTone; readonly icon?: ImageSourcePropType; readonly iconRatio?: number };

/** A row of pieces standing on the top edge, half above it (prizes in their spots), at an art size role. */
export type CardTopRow = { readonly size: keyof typeof ART_SIZE; readonly children: ReactNode };

export type CardProps = {
  readonly paper?: 'cream' | 'white';
  readonly label?: CardLabel;
  readonly art?: CardArt;
  readonly topRow?: CardTopRow;
  /** Stuck on when it mounts, after `delay` ms. */
  readonly arrive?: boolean;
  readonly delay?: number;
  /** Room between the paper's edge and what is on it (default none: rows and panels lay out their own). */
  readonly padding?: 'none' | 'snug' | 'page';
  /** Outer box: margins and size only. */
  readonly style?: StyleProp<LayoutStyle>;
  readonly children?: ReactNode;
};

const CREAM = { colors: [SHADE.creamTop, INK.cream] as const, locations: [0, 0.45] as const };
const WHITE = { colors: [INK.white, INK.white] as const };
const FILL = { flexGrow: 1 } as const;
const TOP_LINE = { width: 2, color: INK.white };
const LIP_CREAM = { width: 4, color: INK.creamDeep };
const LIP_WHITE = { width: 4, color: SHADE.skyPale };
/** The label straddles the top edge 17 pt up (as a page's), 16 in from the side. */
const LABEL_TOP = 17;
const LABEL_INSET = SPACE.margin;
const SPACE_UNDER_LABEL = SPACE.base * 2;
const PADS = { none: 0, snug: SPACE.pageSnug, page: SPACE.pagePad } as const;

function CardImpl({ paper = 'cream', label, art, topRow, arrive = false, delay = 0, padding = 'none', style, children }: CardProps) {
  const place = useStickerPlace();
  const onMap = place.level === 'map';
  const edge = edgeFor('card', place);
  useCountEdge(edge ? 'card' : null);
  const white = paper === 'white';
  const drop = edge ? DROP.cardOnWorld : DROP.cardInPage;
  const dropColor = onMap ? DROP.map : edge ? DROP.color : DROP.inPage;
  const side = art?.side ?? 'left';
  const rowSize = topRow ? ART_SIZE[topRow.size] : 0;
  const padTop = label ? labelReach(false) + SPACE_UNDER_LABEL : topRow ? rowSize / 2 + SPACE.base : 0;
  const pad = PADS[padding];
  const body = (dropStyle?: AnimatedStyle<ViewStyle>) => (
    <Shell radius={RADIUS.card} line={onMap ? LINE.map : LINE.card} face={white ? WHITE : CREAM}
      edge={edge} drop={drop} dropColor={dropColor} dropStyle={dropStyle}
      insetTop={white ? undefined : TOP_LINE} insetBottom={white ? LIP_WHITE : LIP_CREAM}
      style={pad ? [FILL, { padding: pad }] : FILL}>
      <PlaceProvider value={insideCard()}>{padTop ? <View style={{ paddingTop: padTop }}>{children}</View> : children}</PlaceProvider>
      {topRow ? (
        <View pointerEvents="box-none" style={{ position: 'absolute', left: SPACE.base, right: SPACE.base, top: -rowSize / 2, height: rowSize }}>
          <PlaceProvider value={insideCard()}>{topRow.children}</PlaceProvider>
        </View>
      ) : null}
      {label ? (
        <View pointerEvents="none" style={{ position: 'absolute', left: LABEL_INSET, right: LABEL_INSET, top: -LABEL_TOP }}>
          <TitleLabel tone={label.tone} icon={label.icon} iconRatio={label.iconRatio}>{label.text}</TitleLabel>
        </View>
      ) : null}
      {art ? (
        <View pointerEvents="none" style={side === 'left'
          ? { position: 'absolute', left: -(art.over ?? 14), top: art.along ?? 0 }
          : { position: 'absolute', top: -(art.over ?? 14), left: art.along ?? 0 }}>
          <Lift source={art.source} width={art.width} height={art.height} />
        </View>
      ) : null}
    </Shell>
  );
  // What rises above the card is added to any top margin the caller gives, so what sits above is never covered.
  const rise = cardTopRise({ label: !!label, topArt: art && side === 'top' ? art.over ?? 14 : 0, topRow: rowSize, edge });
  const given = StyleSheet.flatten(style) ?? {};
  const outer: StyleProp<ViewStyle> = rise ? [style, { marginTop: rise + (typeof given.marginTop === 'number' ? given.marginTop : 0) }] : style;
  if (arrive) return <Arrive delay={delay} style={outer}>{body}</Arrive>;
  return <View style={outer}>{body()}</View>;
}

const Card = memo(CardImpl);
export default Card;
