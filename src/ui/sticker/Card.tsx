/**
 * Card: cream or white paper. Inside a page (level 2): the navy line, a top highlight, a lip
 * and a 3 pt drop. Straight on the world (level 1): the white cut edge and a 4 pt drop. On the
 * map: the 3 pt line and the 50 percent drop. The card reads its level from where it is mounted;
 * there is no edge prop. Everything inside a card is level 2 on paper.
 *
 * Art (a chest, a coin) hangs off the left or top edge: pass `art`. It is drawn in the card's own
 * place, so on the map its drop is the map's.
 */
import { memo, type ReactNode } from 'react';
import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import type { AnimatedStyle } from 'react-native-reanimated';
import Arrive from './Arrive';
import Lift from './Lift';
import Shell from './Shell';
import { PlaceProvider, useStickerPlace } from './StickerContext';
import { edgeFor, insideCard } from './level';
import { DROP, INK, LINE, RADIUS, SHADE } from './tokens';

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

export type CardProps = {
  readonly paper?: 'cream' | 'white';
  readonly art?: CardArt;
  /** Stuck on when it mounts, after `delay` ms. */
  readonly arrive?: boolean;
  readonly delay?: number;
  /** Room between the paper's edge and what is on it. */
  readonly padding?: number;
  /** Outer box: size and margins. */
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
};

const CREAM = { colors: [SHADE.creamTop, INK.cream] as const, locations: [0, 0.45] as const };
const WHITE = { colors: [INK.white, INK.white] as const };
const FILL = { flexGrow: 1 } as const;
const TOP_LINE = { width: 2, color: INK.white };
const LIP_CREAM = { width: 4, color: INK.creamDeep };
const LIP_WHITE = { width: 4, color: SHADE.skyPale };

function CardImpl({ paper = 'cream', art, arrive = false, delay = 0, padding, style, children }: CardProps) {
  const place = useStickerPlace();
  const onMap = place.level === 'map';
  const edge = edgeFor('card', place);
  const white = paper === 'white';
  const drop = edge ? DROP.cardOnWorld : DROP.cardInPage;
  const dropColor = onMap ? DROP.map : edge ? DROP.color : DROP.inPage;
  const side = art?.side ?? 'left';
  const body = (dropStyle?: AnimatedStyle<ViewStyle>) => (
    <Shell radius={RADIUS.card} line={onMap ? LINE.map : LINE.card} face={white ? WHITE : CREAM}
      edge={edge} drop={drop} dropColor={dropColor} dropStyle={dropStyle}
      insetTop={white ? undefined : TOP_LINE} insetBottom={white ? LIP_WHITE : LIP_CREAM}
      style={padding === undefined ? FILL : [FILL, { padding }]}>
      <PlaceProvider value={insideCard()}>{children}</PlaceProvider>
      {art ? (
        <View pointerEvents="none" style={side === 'left'
          ? { position: 'absolute', left: -(art.over ?? 14), top: art.along ?? 0 }
          : { position: 'absolute', top: -(art.over ?? 14), left: art.along ?? 0 }}>
          <Lift source={art.source} width={art.width} height={art.height} />
        </View>
      ) : null}
    </Shell>
  );
  if (arrive) return <Arrive delay={delay} style={style}>{body}</Arrive>;
  return <View style={style}>{body()}</View>;
}

const Card = memo(CardImpl);
export default Card;
