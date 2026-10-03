/** Route "FrightRecap" { eventSlug, nightOn, playerId? }: the Marquee as a screen (collection book, profile). */
import { useNavigation, useRoute } from '@react-navigation/native';
import { View } from 'react-native';
import { NIGHT } from '../../services/fright/theme';
import { MarqueeBody } from './MarqueeRecap';

export default function FrightRecapScreen() {
  const navigation = useNavigation();
  const params = (useRoute().params ?? {}) as { eventSlug?: string; nightOn?: string; playerId?: number | null };
  const close = () => { if (navigation.canGoBack()) navigation.goBack(); };
  return (
    <View style={{ flex: 1, backgroundColor: NIGHT.scrim, justifyContent: 'flex-end' }}>
      {params.eventSlug && params.nightOn
        ? <MarqueeBody eventSlug={params.eventSlug} nightOn={params.nightOn} playerId={params.playerId} onClose={close} />
        : null}
    </View>
  );
}
