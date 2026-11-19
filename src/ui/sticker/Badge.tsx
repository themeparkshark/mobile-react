/** Badge: the red count. 1 to 9, then 9+. A thin white ring keeps it off the art under it. */
import { memo } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import StickerText from './StickerText';
import { BADGE, INK } from './tokens';

export function badgeText(count: number): string {
  if (!(count > 0)) return '';
  return count > 9 ? '9+' : String(Math.floor(count));
}

function BadgeImpl({ count, label, style }: { readonly count: number; readonly label?: string; readonly style?: StyleProp<ViewStyle> }) {
  const text = badgeText(count);
  if (!text) return null;
  const outer = BADGE.size + BADGE.ring * 2;
  return (
    <View accessible accessibilityRole="text" accessibilityLabel={label ?? `${count} new`}
      style={[{ minWidth: outer, height: outer, borderRadius: outer / 2, backgroundColor: INK.white, padding: BADGE.ring }, style]}>
      <View style={{ flex: 1, borderRadius: BADGE.size / 2, backgroundColor: INK.red, borderWidth: 2, borderColor: INK.navy,
        alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4, paddingTop: 2 }}>
        <StickerText size={BADGE.font} tone="white" lineHeight={16} spacing={0} role="none" maxScale={1.1}>{text}</StickerText>
      </View>
    </View>
  );
}

const Badge = memo(BadgeImpl);
export default Badge;
