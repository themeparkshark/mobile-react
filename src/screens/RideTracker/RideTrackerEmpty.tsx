import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import GameButton from '../../ui/GameButton';
import type { GameIconName } from '../../ui/GameIcon';

/**
 * One empty state for every Ride Tracker page: a card in the upper third with the shark, a
 * short title, one line of what to do, and the game's chunky button. It replaces a small icon
 * floating in a mostly empty pale blue page.
 */
export default function RideTrackerEmpty({ title, body, action }: {
  readonly title: string;
  readonly body: string;
  readonly action?: { readonly label: string; readonly icon?: GameIconName; readonly onPress: () => void; readonly disabled?: boolean };
}) {
  return (
    <View style={s.card}>
      <Image source={require('../../../assets/images/screens/lineplay/queue-recap-shark.png')}
        style={s.art} contentFit="contain" accessible={false} />
      <Text style={s.title} maxFontSizeMultiplier={1.3}>{title}</Text>
      <Text style={s.body} maxFontSizeMultiplier={1.3}>{body}</Text>
      {action && (
        <GameButton label={action.label} icon={action.icon} disabled={action.disabled}
          onPress={action.onPress} style={s.button} />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginTop: 20,
    marginHorizontal: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#abd9f1',
  },
  art: { width: 150, height: 150 },
  title: { color: '#05346e', fontSize: 22, fontFamily: 'Shark', marginTop: 8, textAlign: 'center' },
  body: { color: '#2c5a85', fontSize: 16, fontFamily: 'Knockout', marginTop: 6, textAlign: 'center' },
  button: { marginTop: 20 },
});
