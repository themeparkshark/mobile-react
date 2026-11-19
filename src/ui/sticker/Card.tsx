/**
 * Card: cream or white paper. Inside a page (level 2): the navy line, a top highlight, a lip
 * and a 3 pt drop. Straight on the world (level 1): the white cut edge and a 4 pt drop. On the
 * map: the 3 pt line and the 50 percent drop. The card reads its level from where it is mounted.
 *
 * Art (a chest, a coin) hangs off the left or top edge: pass `art`.
 */
import { memo, type ReactNode } from 'react';
import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import Lift from './Lift';
import Shell from './Shell';
import { PlaceProvider, useEdge } from './StickerContext';
import { insideCard } from './level';
import { useStickOn } from './motion';
import { DROP, EDGE, INK, LINE, RADIUS, SHADE } from './tokens';

export type CardArt = {
  readonly source: ImageSourcePropType;
  readonly width: number;
  readonly height: number;
  /** Hang off the left edge (rows) or the top edge (prizes). */
  readonly side?: 'left' | 'top';
  /** How far past the edge, in pt (default 13 to 14, as the board). */
  readonly over?: number;
  /** Offset along the edge, in pt. */
  readonly along?: number;
};

export type CardProps = {
  readonly paper?: 'cream' | 'white';
  /** Ask for the edge: honoured on the world, refused (with a dev warning) inside a page. */
  readonly edge?: boolean;
  readonly art?: CardArt;
  readonly arrive?: boolean;
  /** Room between the paper's edge and what is on it. */
  readonly padding?: number;
  /** Outer box: size and margins. */
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: ReactNode;
};

const CREAM = { colors: [SHADE.creamTop, INK.cream] as const, locations: [0, 0.45] as const };
const WHITE = { colors: [INK.white, INK.white] as const };
const FILL = { flexGrow: 1 } as const;

function CardImpl({ paper = 'cream', edge: asked, art, arrive = false, padding, style, children }: CardProps) {
  const { edge, place } = useEdge('Card', asked);
  const onMap = place.level === 'map';
  const stick = useStickOn(arrive);
  const white = paper === 'white';
  const drop = edge ? DROP.cardOnWorld : DROP.cardInPage;
  const dropColor = onMap ? DROP.map : edge ? DROP.color : DROP.inPage;
  const side = art?.side ?? 'left';
  return (
    <Animated.View style={[style, stick.body]}>
      <Shell radius={RADIUS.card} line={onMap ? LINE.map : LINE.card} face={white ? WHITE : CREAM}
        edge={edge ? EDGE.card : 0} drop={drop} dropColor={dropColor} dropStyle={stick.drop}
        insetTop={white ? undefined : { width: 2, color: INK.white }}
        insetBottom={{ width: 4, color: white ? SHADE.skyPale : INK.creamDeep }}
        style={padding === undefined ? FILL : [FILL, { padding }]}>
        <PlaceProvider value={insideCard(place)}>
          {children}
          {art ? (
            <View pointerEvents="none" style={side === 'left'
              ? { position: 'absolute', left: -(art.over ?? 14), top: art.along ?? 0 }
              : { position: 'absolute', top: -(art.over ?? 14), left: art.along ?? 0 }}>
              <Lift source={art.source} width={art.width} height={art.height} />
            </View>
          ) : null}
        </PlaceProvider>
      </Shell>
    </Animated.View>
  );
}

const Card = memo(CardImpl);
export default Card;
