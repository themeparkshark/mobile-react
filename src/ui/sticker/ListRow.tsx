/**
 * ListRow: a card with Alex's art hanging off its left edge, a title, one line and one action
 * (DIRECTION.md kit: List row; kit.png "List row"). The row owns its layout: the art's room, the
 * action's width (one per list, `actionWidth`), the gap of at least 8 pt between words and action,
 * and an optional `strip` (spots, a week row) on its own line under the words. The art hangs off
 * the card by the page's padding less SPACE.artClear, so it keeps 8 pt from the page's line at
 * every width (rowArtOver).
 *
 * States: ready (the gold primary: the one on the screen), second (blue), third (white: also the
 * right pick for a secondary action in a long list), done (the green check and the caller's done
 * word) and notyet (the white action, spots in the strip). The action can be busy (a claim
 * running) or off. The row is a Card, so it reads its level from where it is mounted.
 *
 * Props are flat (actionLabel, onAction, actionBusy, actionDisabled) and the handler is kept in a
 * ref, so a parent's re-render never re-renders the rows (memo holds).
 *
 * VoiceOver: the row is one stop with one combined label (title, line, the badge's count with its
 * noun, the action or the done word) and its action is the row's button; double tap runs it.
 */
import { memo, useCallback, useRef, type ReactNode } from 'react';
import { View, type AccessibilityActionEvent, type ImageSourcePropType, type StyleProp } from 'react-native';
import Badge, { badgeLabel } from './Badge';
import Card from './Card';
import Glyph from './Glyph';
import StickerButton, { type StickerVariant } from './StickerButton';
import StickerText from './StickerText';
import { rowArtOver } from './layout';
import type { LayoutStyle } from './style';
import { TEXT } from './textRoles';
import { ROW, SPACE } from './tokens';

export type ListRowState = 'ready' | 'second' | 'third' | 'done' | 'notyet';

export type ListRowProps = {
  readonly art: { readonly source: ImageSourcePropType; readonly width: number; readonly height: number };
  readonly title: string;
  readonly line?: string;
  /** Spots or a small bar under the words (Daily 3's three spots), beside the action as the board draws it. */
  readonly strip?: ReactNode;
  /** The strip is too wide to share the row with the action (the seven-day week row): it takes its own full line. */
  readonly stripWide?: boolean;
  readonly state: ListRowState;
  /** The action's words (every state but done). */
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly actionBusy?: boolean;
  readonly actionDisabled?: boolean;
  /** The done word beside the check ("Opened"). */
  readonly doneLabel?: string;
  /** One width for every action in the list. */
  readonly actionWidth?: number;
  /** A red count on the art, said with its noun ("20 prizes"). */
  readonly badge?: number;
  readonly badgeNoun?: string;
  /** What VoiceOver says for the whole row (default: title, line, the badge, then the action or the done word). */
  readonly accessibilityLabel?: string;
  /** The page padding the row sits in (the art's overhang keeps 8 pt from the page's line). */
  readonly pagePad?: number;
  readonly arrive?: boolean;
  readonly delay?: number;
  readonly style?: StyleProp<LayoutStyle>;
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

function ListRowImpl({ art, title, line, strip, stripWide = false, state, actionLabel, onAction, actionBusy = false, actionDisabled = false, doneLabel,
  actionWidth = ROW.actionWidth, badge, badgeNoun, accessibilityLabel, pagePad = SPACE.pagePad, arrive, delay, style }: ListRowProps) {
  const variant = rowVariant(state);
  const done = state === 'done';
  const hasAction = !done && !!actionLabel && !!variant;
  const said = accessibilityLabel ?? [badgeLabel(title, badge, badgeNoun), line, done ? doneLabel : actionLabel].filter(Boolean).join(', ');
  // The caller's handler in a ref: stable callbacks, so memo holds across parent renders.
  const handler = useRef(onAction);
  handler.current = onAction;
  const press = useCallback(() => handler.current?.(), []);
  const onA11y = useCallback((e: AccessibilityActionEvent) => { if (e.nativeEvent.actionName === 'activate') handler.current?.(); }, []);
  const artTop = Math.max(0, (ROW.min - art.height) / 2);
  const over = rowArtOver(pagePad, ROW.artOver);
  const live = hasAction && !actionBusy && !actionDisabled;
  return (
    <View accessible accessibilityRole={hasAction ? 'button' : 'text'} accessibilityLabel={said}
      accessibilityState={hasAction ? { busy: actionBusy, disabled: actionDisabled } : undefined}
      accessibilityActions={live ? ACTIVATE : undefined} onAccessibilityAction={live ? onA11y : undefined} style={style}>
      <Card arrive={arrive} delay={delay} art={{ ...art, side: 'left', over, along: artTop }}>
        <View style={{ minHeight: ROW.min, paddingLeft: ROW.artRoom + (ROW.artOver - over), paddingRight: ROW.padRight, paddingVertical: SPACE.base + 2, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: ROW.gap }}>
            <View style={{ flex: 1 }}>
              <View style={{ paddingTop: 2 }}>
                <StickerText spec={TITLE} align="left" role="none" fit>{title}</StickerText>
              </View>
              {line ? <StickerText spec={LINE_SPEC} tone="soft" align="left" lines={0} role="none">{line}</StickerText> : null}
              {strip && !stripWide ? <View style={{ marginTop: SPACE.base / 2 }}>{strip}</View> : null}
            </View>
            {done ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.base + 2, paddingRight: SPACE.base }}>
                <Glyph kind="check" size={20} />
                {doneLabel ? <StickerText spec={DONE} tone="soft" role="none">{doneLabel}</StickerText> : null}
              </View>
            ) : hasAction && variant ? (
              <StickerButton label={actionLabel} variant={variant} size="row" width={actionWidth} onPress={press} busy={actionBusy} disabled={actionDisabled} />
            ) : null}
          </View>
          {strip && stripWide ? <View style={{ marginTop: SPACE.base, marginBottom: 2 }}>{strip}</View> : null}
        </View>
        {badge ? <Badge count={badge} label="" hidden style={{ position: 'absolute', left: ROW.badgeLeft + (ROW.artOver - over), top: -SPACE.base * 2 - 1 }} /> : null}
      </Card>
    </View>
  );
}

const ListRow = memo(ListRowImpl);
export default ListRow;
