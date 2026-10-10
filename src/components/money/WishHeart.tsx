import { Pressable, StyleSheet, View } from 'react-native';
import { GameIcon } from '../../ui';
import { toggleWish, useWishlist } from '../../services/money/wishlist';

/** "I'd like this": a heart a kid taps; the grown-up page lists it. Saved on this phone only. */
export default function WishHeart({ id, name, style }: { id: string; name: string; style?: object }) {
  const on = useWishlist().some(w => w.id === id);
  return (
    <Pressable onPress={() => toggleWish({ id, name })} hitSlop={10} accessibilityRole="button"
      accessibilityState={{ selected: on }} accessibilityLabel={on ? `Remove ${name} from your wishlist` : `Add ${name} to your wishlist for a grown-up`}
      style={[st.heart, on && st.on, style]}>
      <View style={{ opacity: on ? 1 : 0.45 }}><GameIcon name="heart" size={20} /></View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  heart: { position: 'absolute', top: 6, left: 6, width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#05346e', zIndex: 5 },
  on: { backgroundColor: '#ffe3ea', borderColor: '#e8322a' },
});
