import { Pressable, Text, View } from 'react-native';
import { FeaturedRideCoinType } from '../models/player-type';
import { coinLevelLabel, coinTier } from '../constants/coinTiers';
import ShelfCoin from './collection/ShelfCoin';
import GameIcon from '../ui/GameIcon';

/** The player's showcase coin on a bright gold plinth (Profile). */
export default function FeaturedRideCoinCard({
  coin,
  onPress,
}: {
  coin: FeaturedRideCoinType;
  onPress?: () => void;
}) {
  const tier = coinTier(coin.current_level);
  const content = (
    <View style={{
      marginTop: 12, marginBottom: 12, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 20,
      backgroundColor: '#fff8e4', borderWidth: 3, borderColor: '#ffffff',
      flexDirection: 'row', alignItems: 'center', gap: 14,
      shadowColor: '#05346e', shadowOpacity: 0.22, shadowOffset: { width: 0, height: 4 }, shadowRadius: 8, elevation: 5,
    }}>
      <View style={{ width: 86, alignItems: 'center' }}>
        <View style={{ zIndex: 1, marginBottom: -10 }}>
          <ShelfCoin coinUrl={coin.coin_url} level={coin.current_level} size={70} />
        </View>
        {/* The plinth: a gold stand the coin rests on. */}
        <View style={{ width: 84, height: 22, borderRadius: 42, backgroundColor: '#ffcf3b',
          borderWidth: 2, borderColor: '#ffffff', borderBottomWidth: 5, borderBottomColor: tier.ringDeep === '#9cc8ea' ? '#d99a00' : tier.ringDeep }} />
      </View>
      <View style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 2 }}>
          <GameIcon name="star" size={16} />
          <Text style={{ color: '#8a5a00', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1 }}>FEATURED RIDE COIN</Text>
        </View>
        <Text style={{ color: '#05346e', fontFamily: 'Shark', fontSize: 19 }} numberOfLines={2}>
          {coin.ride_name}
        </Text>
        <Text style={{ color: '#3d5f8c', fontFamily: 'Knockout', fontSize: 15, marginTop: 2 }}>
          {coinLevelLabel(coin.current_level)}
        </Text>
        {coin.latest_edition && <Text style={{ color: '#0768b9', fontFamily: 'Knockout', fontSize: 14, marginTop: 3 }}
          numberOfLines={1}>
          {coin.latest_edition.name} edition
        </Text>}
      </View>
      {onPress && <GameIcon name="arrow" size={28} />}
    </View>
  );

  return onPress ? (
    <Pressable onPress={onPress} accessibilityRole="button"
      accessibilityLabel={`Featured ride coin: ${coin.ride_name}, ${coinLevelLabel(coin.current_level)}. Open it on its park shelf.`}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      {content}
    </Pressable>
  ) : content;
}
