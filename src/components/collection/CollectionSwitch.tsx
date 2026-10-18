import { StackActions } from '@react-navigation/native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { navigationRef } from '../../RootNavigation';
import { haptic } from '../../gamekit/Haptics';
import { BRAND, GameIcon } from '../../ui';

type Side = 'stamps' | 'coins';

/**
 * One front door for the two collections: Stamps and Ride Coins sit side by side.
 * Switching replaces the screen, so Back still returns to where the kid came from.
 */
export default function CollectionSwitch({ active }: { readonly active: Side }) {
  const go = (side: Side) => {
    if (side === active || !navigationRef.isReady()) return;
    haptic('tickSelection');
    navigationRef.dispatch(StackActions.replace(side === 'stamps' ? 'StampBook' : 'CoinShelf'));
  };
  return (
    <View style={styles.row} accessibilityRole="tablist">
      {([['stamps', 'Stamps', 'star'], ['coins', 'Ride Coins', 'coins']] as const).map(([side, label, icon]) => {
        const on = side === active;
        return (
          <Pressable key={side} onPress={() => go(side)} accessibilityRole="tab" accessibilityState={{ selected: on }}
            accessibilityLabel={label} hitSlop={6} style={[styles.tab, on && styles.tabOn]}>
            <GameIcon name={icon} size={20} />
            <Text style={[styles.text, on && styles.textOn]} maxFontSizeMultiplier={1.3}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignSelf: 'center', marginTop: 10, marginBottom: 2, padding: 4, gap: 4,
    backgroundColor: 'rgba(5,52,110,0.55)', borderRadius: 22 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 16, borderRadius: 18 },
  tabOn: { backgroundColor: BRAND.gold },
  text: { fontFamily: 'Shark', fontSize: 16, color: '#ffffff' },
  textOn: { color: BRAND.navy },
});
