/**
 * Badge: the red count. The real number up to 99, then 99+. A thin white ring keeps it off the art
 * under it. What VoiceOver says comes from the caller ("20 prizes to claim").
 */
import { memo } from 'react';
import { View, type StyleProp } from 'react-native';
import StickerText from './StickerText';
import type { LayoutStyle } from './style';
import { TEXT } from './textRoles';
import { BADGE, INK } from './tokens';

export function badgeText(count: number): string {
  if (!(count > 0)) return '';
  return count > BADGE.max ? `${BADGE.max}+` : String(Math.floor(count));
}

/**
 * What VoiceOver says for a part that wears a badge: the caller's words, then the count and the
 * caller's noun ("Daily chest, 2 ready"), composed by the part so the count and the words never
 * drift. No count: the words alone. Pure, tested.
 */
export function badgeLabel(words: string, count: number | undefined, noun?: string): string {
  const text = count ? badgeText(count) : '';
  if (!text) return words;
  const said = text === `${BADGE.max}+` ? `over ${BADGE.max}` : text;
  return noun ? `${words}, ${said} ${noun}` : `${words}, ${said}`;
}

const SPEC = { ...TEXT.tag, size: BADGE.font, spacing: 0, maxScale: 1 };

function BadgeImpl({ count, label, hidden = false, style }: {
  readonly count: number;
  /** What VoiceOver says. */
  readonly label: string;
  /** A parent already says the count (a round button's label). */
  readonly hidden?: boolean;
  readonly style?: StyleProp<LayoutStyle>;
}) {
  const text = badgeText(count);
  if (!text) return null;
  const outer = BADGE.size + BADGE.ring * 2;
  const a11y = hidden ? { accessible: false, importantForAccessibility: 'no-hide-descendants' as const } : { accessible: true, accessibilityRole: 'text' as const, accessibilityLabel: label };
  return (
    <View {...a11y} pointerEvents="none"
      style={[{ minWidth: outer, height: outer, borderRadius: outer / 2, backgroundColor: INK.white, padding: BADGE.ring, alignSelf: 'flex-start' }, style]}>
      <View style={{ flexGrow: 1, borderRadius: BADGE.size / 2, backgroundColor: INK.red, borderWidth: 2, borderColor: INK.navy,
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingTop: 2 }}>
        <StickerText spec={SPEC} tone="white" lineHeight={16} role="none" tabular>{text}</StickerText>
      </View>
    </View>
  );
}

const Badge = memo(BadgeImpl);
export default Badge;
