import { Image } from 'expo-image';
import { Text, TouchableOpacity, View } from 'react-native';
import { FeaturedRideCoinType } from '../models/player-type';

export default function FeaturedRideCoinCard({
  coin,
  onPress,
}: {
  coin: FeaturedRideCoinType;
  onPress?: () => void;
}) {
  const content = (
    <View style={{
      marginTop: 12, marginBottom: 12, padding: 14, borderRadius: 18,
      backgroundColor: '#182A39', borderWidth: coin.latest_edition ? 2 : 1,
      borderColor: coin.latest_edition?.color ?? '#F4CD72',
      flexDirection: 'row', alignItems: 'center', gap: 14,
    }}>
      <Image source={{ uri: coin.coin_url }} contentFit="contain" style={{ width: 66, height: 66 }} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: '#F4CD72', fontFamily: 'Knockout', fontSize: 12,
          letterSpacing: 1, marginBottom: 3 }}>FEATURED RIDE COIN</Text>
        <Text style={{ color: 'white', fontFamily: 'Shark', fontSize: 18 }} numberOfLines={2}>
          {coin.ride_name}
        </Text>
        <Text style={{ color: '#D5DFE8', fontFamily: 'Knockout', fontSize: 13, marginTop: 3 }}>
          Level {coin.current_level}/{coin.max_level} · Earned at the ride
        </Text>
        {coin.latest_edition && <Text style={{ color: coin.latest_edition.color,
          fontFamily: 'Knockout', fontSize: 12, marginTop: 4 }} numberOfLines={1}>
          ✦ {coin.latest_edition.name}
        </Text>}
      </View>
    </View>
  );

  return onPress ? (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8} accessibilityRole="button"
      accessibilityLabel={`Featured ride coin: ${coin.ride_name}. Open coin shelf.`}>
      {content}
    </TouchableOpacity>
  ) : content;
}
