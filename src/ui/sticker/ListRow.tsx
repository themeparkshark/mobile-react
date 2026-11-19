/**
 * ListRow: a card with Alex's art hanging off its left edge, a title, one line and one action
 * (DIRECTION.md kit: List row). States: ready (gold, the one on the screen), second (blue),
 * done (the green check) and not yet (spots under the title, passed as `extra`).
 * The row is a Card, so it reads its level from where it is mounted: inside a sheet it has a
 * navy line and a lip, never a white edge.
 */
import { memo, type ReactNode } from 'react';
import { View, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Badge from './Badge';
import Card from './Card';
import Glyph from './Glyph';
import StickerButton, { type StickerButtonColor } from './StickerButton';
import StickerText from './StickerText';
import { INK, TYPE } from './tokens';

export type ListRowAction = {
  readonly label: string;
  readonly color?: StickerButtonColor;
  readonly width: number;
  readonly primary?: boolean;
  readonly accessibilityLabel?: string;
  readonly onPress?: () => void;
};

export type ListRowProps = {
  readonly art: { readonly source: ImageSourcePropType; readonly width: number; readonly height: number; readonly over?: number; readonly along?: number };
  readonly title: string;
  readonly line?: string;
  /** Lines the sentence may wrap to (default 1). */
  readonly lineLines?: number;
  /** Under the title instead of (or after) the line: spots, a small bar. */
  readonly extra?: ReactNode;
  readonly action?: ListRowAction;
  readonly done?: boolean;
  readonly badge?: number;
  readonly arrive?: boolean;
  readonly style?: StyleProp<ViewStyle>;
};

const ROW_MIN = 62;
const ART_ROOM = 58;

function ListRowImpl({ art, title, line, lineLines = 1, extra, action, done = false, badge, arrive, style }: ListRowProps) {
  return (
    <Card arrive={arrive} art={{ ...art, side: 'left', over: art.over ?? 14, along: art.along ?? Math.max(0, (ROW_MIN - art.height) / 2) }} style={style}>
      <View style={{ minHeight: ROW_MIN, flexDirection: 'row', alignItems: 'center', paddingLeft: ART_ROOM, paddingRight: 10, paddingVertical: 6, gap: 8 }}>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <View style={{ paddingTop: 2 }}>
            <StickerText size={TYPE.row} tone="navy" stroke={0} spacing={0.03} align="left" lineHeight={21} fit>{title}</StickerText>
          </View>
          {line ? (
            <StickerText size={TYPE.bodySmall} font="knockout" fill={INK.navySoft} stroke={0} spacing={0.015} align="left" lineHeight={16} lines={lineLines} fit={false}>{line}</StickerText>
          ) : null}
          {extra}
        </View>
        {done ? <Glyph kind="check" size={30} /> : action ? (
          <StickerButton label={action.label} color={action.color ?? 'blue'} size="medium" faceHeight={36} fontSize={action.label.length > 6 ? 17 : 18}
            width={action.width} primary={action.primary} accessibilityLabel={action.accessibilityLabel ?? `${action.label} ${title}`} onPress={action.onPress} />
        ) : null}
      </View>
      {badge ? <Badge count={badge} label={`${badge} to claim`} style={{ position: 'absolute', left: 24, top: -8 }} /> : null}
    </Card>
  );
}

const ListRow = memo(ListRowImpl);
export default ListRow;
