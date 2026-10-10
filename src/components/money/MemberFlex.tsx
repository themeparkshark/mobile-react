import { Image } from 'expo-image';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Playercard from '../Playercard';
import type { InventoryType } from '../../models/inventory-type';
import { BRAND, FONT, GameIcon } from '../../ui';
import { frameArt } from './frames';

/**
 * A player's flex, for any surface that shows another kid (Standings rows, share cards, profile):
 * their shark as they dressed it (worn pin included), their season frame around it, and a small VIP
 * mark. Subtle by design: no price, no "bought", no "Plus". Members and non-members look equally
 * proud; the frame and pins are earned or bought, never ranked by money.
 *
 * - `size`: the square it fills (the frame ring overlaps the edge a little).
 * - `variant`: 'row' (compact, Standings) or 'card' (share card: bigger, with a caption line).
 * - `still`: no idle motion (lists, Reduce Motion, share captures).
 */
export default function MemberFlex({ inventory, frame, vip = false, size = 56, variant = 'row', caption, still = true, style }: {
  inventory: InventoryType | null | undefined;
  frame?: string | null;
  vip?: boolean;
  size?: number;
  variant?: 'row' | 'card';
  /** Card variant: a short line under the shark, e.g. "Frosty Fins · Step 25". */
  caption?: string | null;
  still?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ring = frameArt(frame);
  const card = variant === 'card';
  const inner = ring ? size * 0.72 : size;
  return (
    <View style={[{ alignItems: 'center' }, style]}
      accessible accessibilityLabel={`${vip ? 'VIP member. ' : ''}${ring ? 'Wearing a season frame. ' : ''}${caption ?? ''}`.trim() || 'Player'}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {inventory?.skin_item ? (
          <View style={{ width: inner, height: inner * 1.1, marginTop: ring ? size * 0.02 : 0 }}>
            <Playercard inventory={inventory} showBackground={false} pinAnchor="body" still={still} style={StyleSheet.absoluteFill} />
          </View>
        ) : (
          <GameIcon name="shark" size={inner * 0.8} />
        )}
        {ring && <Image source={ring} style={[StyleSheet.absoluteFill, { width: size, height: size }]} contentFit="contain" />}
        {vip && (
          <View style={[st.vip, { width: card ? 30 : 20, height: card ? 30 : 20, borderRadius: card ? 15 : 10 }]}>
            <GameIcon name="member" size={card ? 20 : 13} />
          </View>
        )}
      </View>
      {card && caption ? <Text style={st.caption} numberOfLines={1}>{caption}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  vip: { position: 'absolute', right: 0, bottom: 0, backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.gold,
    alignItems: 'center', justifyContent: 'center' },
  caption: { marginTop: 6, fontFamily: FONT.display, fontSize: 16, color: '#ffffff', textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
});
