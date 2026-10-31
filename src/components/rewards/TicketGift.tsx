import { View } from 'react-native';
import GameIcon from '../../ui/GameIcon';

/**
 * A held extra try (blueprint 4.5): the Ticket picture with a small gift on its
 * corner. Two existing pictures, no new art.
 */
export default function TicketGift({ size = 30 }: { readonly size?: number }) {
  return (
    <View style={{ width: size, height: size }}>
      <GameIcon name="ticket" size={size} />
      <View style={{ position: 'absolute', right: -size * 0.18, bottom: -size * 0.12 }}>
        <GameIcon name="gift" size={Math.round(size * 0.58)} />
      </View>
    </View>
  );
}
