import { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { BRAND, GameIcon, type GameIconName } from '../../ui';

/**
 * A prize icon that reads at small sizes: the pink ticket gets a white disc
 * with a navy outline (Alex's thick-outline look), so it never smears into
 * the cream card. Other prize icons already carry their own outline.
 */
function PrizeIcon({ name, size }: { readonly name: GameIconName; readonly size: number }) {
  if (name !== 'ticket') return <GameIcon name={name} size={size} />;
  const d = size + 4;
  return (
    <View style={[styles.disc, { width: d, height: d, borderRadius: d / 2 }]}>
      <GameIcon name="ticket" size={size + 2} />
    </View>
  );
}

export default memo(PrizeIcon);

const styles = StyleSheet.create({
  disc: { backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
});
