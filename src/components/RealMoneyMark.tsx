import { StyleSheet, Text, View } from 'react-native';

/**
 * The one picture for "real money" (clarity pass): a green dollar coin.
 * Game coins are gold with a fin; real money is always this green "$", so a
 * kid who can't read yet still tells the two apart. The VIP badge means VIP
 * only, and the grown-up gate uses the lock.
 */
export const REAL_MONEY_GREEN = '#1f9d55';
export const REAL_MONEY_TINT = '#e9f9ee';
export const REAL_MONEY_INK = '#11643a';

export default function RealMoneyMark({ size = 28 }: { readonly size?: number }) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={[styles.disc, { width: size, height: size, borderRadius: size / 2, borderWidth: Math.max(2, size / 12) }]}
    >
      <Text allowFontScaling={false} style={[styles.sign, { fontSize: size * 0.62, lineHeight: size * 0.8 }]}>$</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { backgroundColor: REAL_MONEY_GREEN, borderColor: '#ffffff', alignItems: 'center', justifyContent: 'center' },
  sign: { fontFamily: 'Shark', color: '#ffffff', textAlign: 'center', includeFontPadding: false },
});
