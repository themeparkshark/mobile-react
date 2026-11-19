/**
 * ListRow: a card with Alex's art hanging off its left edge, a title, one line and one action
 * (DIRECTION.md kit: List row; kit.png "List row"). The row owns its layout: the art's room, the
 * action's width (one per list, `actionWidth`), the gap of at least 8 pt between words and action,
 * and an optional `strip` (spots, a week row) on its own line under the words.
 *
 * States: ready (the gold primary: the one on the screen), second (blue), third (white: also the
 * right pick for a secondary action in a long list), done (the green check and the caller's done
 * word) and notyet (the white action, spots in the strip). The row is a Card, so it reads its level
 * from where it is mounted: inside a sheet it has a navy line and a lip, never a white edge.
 *
 * VoiceOver: the row is one stop with one combined label (title, line, the action or the done word)
 * and its action is the row's button; double tap runs it. All spoken copy comes from the caller.
 */
import { memo, useCallback, type ReactNode } from 'react';
import { View, type AccessibilityActionEvent, type ImageSourcePropType, type StyleProp, type ViewStyle } from 'react-native';
import Badge from './Badge';
import Card from './Card';
import Glyph from './Glyph';
import StickerButton, { type StickerVariant } from './StickerButton';
import StickerText from './StickerText';
import { TEXT } from './textRoles';
import { ROW, SPACE } from './tokens';

export type ListRowState = 'ready' | 'second' | 'third' | 'done' | 'notyet';

export type ListRowProps = {
  readonly art: { readonly source: ImageSourcePropType; readonly width: number; readonly height: number };
  readonly title: string;
  readonly line?: string;
  /** Spots or a small bar on its own line under the words (the week row, Daily 3). */
  readonly strip?: ReactNode;
  readonly state: ListRowState;
  /** The action's words and what it does (every state but done). */
  readonly action?: { readonly label: string; readonly onPress?: () => void };
  /** The done word beside the check ("Opened"). */
  readonly doneLabel?: string;
  /** One width for every action in the list. */
  readonly actionWidth?: number;
  readonly badge?: { readonly count: number };
  /** What VoiceOver says for the whole row (default: title, line, then the action or the done word). */
  readonly accessibilityLabel?: string;
  readonly arrive?: boolean;
  readonly delay?: number;
  readonly style?: StyleProp<ViewStyle>;
};

/** The variant each state's action wears. Pure, so it is tested. */
export function rowVariant(state: ListRowState): StickerVariant | null {
  switch (state) {
    case 'ready': return 'primary';
    case 'second': return 'second';
    case 'third':
    case 'notyet': return 'third';
    default: return null;
  }
}

/** Room the words get on a row of a given card width (the art's room, the action, the gaps). */
export function rowBodyWidth(cardWidth: number, actionWidth: number = ROW.actionWidth, hasAction: boolean = true): number {
  return Math.max(0, cardWidth - 5 - ROW.artRoom - ROW.padRight - (hasAction ? actionWidth + ROW.gap : 0));
}

const TITLE = { ...TEXT.name, maxScale: 1.2 };
const LINE_SPEC = TEXT.bodySmall;
const DONE = { ...TEXT.nameSmall, size: 16, maxScale: 1.2 };
const ACTIVATE = [{ name: 'activate' as const }];

function ListRowImpl({ art, title, line, strip, state, action, doneLabel, actionWidth = ROW.actionWidth, badge, accessibilityLabel, arrive, delay, style }: ListRowProps) {
  const variant = rowVariant(state);
  const done = state === 'done';
  const said = accessibilityLabel ?? [title, line, done ? doneLabel : action?.label].filter(Boolean).join(', ');
  const onAction = useCallback((e: AccessibilityActionEvent) => { if (e.nativeEvent.actionName === 'activate') action?.onPress?.(); }, [action]);
  const artTop = Math.max(0, (ROW.min - art.height) / 2);
  return (
    <View accessible accessibilityRole={done || !action ? 'text' : 'button'} accessibilityLabel={said}
      accessibilityActions={done || !action ? undefined : ACTIVATE} onAccessibilityAction={done || !action ? undefined : onAction} style={style}>
      <Card arrive={arrive} delay={delay} art={{ ...art, side: 'left', over: 14, along: artTop }}>
        <View style={{ minHeight: ROW.min, paddingLeft: ROW.artRoom, paddingRight: ROW.padRight, paddingVertical: 6, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ROW.gap }}>
            <View style={{ flex: 1 }}>
              <View style={{ paddingTop: 2 }}>
                <StickerText spec={TITLE} align="left" role="none" fit>{title}</StickerText>
              </View>
              {line ? <StickerText spec={LINE_SPEC} tone="soft" align="left" lines={2} role="none">{line}</StickerText> : null}
            </View>
            {done ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingRight: 4 }}>
                <Glyph kind="check" size={20} />
                {doneLabel ? <StickerText spec={DONE} tone="soft" role="none">{doneLabel}</StickerText> : null}
              </View>
            ) : action && variant ? (
              <StickerButton label={action.label} variant={variant} size="row" width={actionWidth} onPress={action.onPress} fit />
            ) : null}
          </View>
          {strip ? <View style={{ marginTop: SPACE.base, marginBottom: 2 }}>{strip}</View> : null}
        </View>
        {badge ? <Badge count={badge.count} label="" hidden style={{ position: 'absolute', left: 26, top: -9 }} /> : null}
      </Card>
    </View>
  );
}

const ListRow = memo(ListRowImpl);
export default ListRow;
