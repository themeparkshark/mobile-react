import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { spacing, borderRadius, shadows } from '../../../design-system';
import { GameIcon } from '../../../ui';

export default function NewRoundsBanner({ count, paused, onJump }: {
  count: number;
  paused: boolean;
  onJump: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${count} new optional LinePlay rounds. ${paused ? 'Resume play to jump to them.' : 'Jump to the first new round.'}`}
      disabled={paused}
      onPress={onJump}
      style={styles.banner}>
      <Image source={require('../../../../assets/images/screens/pin-collections/shark.png')}
        contentFit="contain" style={styles.shark} accessibilityLabel="Theme Park Shark mascot" />
      <View style={styles.text}>
        <Text style={styles.kicker}>YOUR WAIT CHAPTER EXPANDED</Text>
        <Text style={styles.title}>{count} new optional round{count === 1 ? '' : 's'}</Text>
      </View>
      {paused ? <Text style={styles.action}>PAUSED</Text> : <GameIcon name="play" size={40} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: { marginHorizontal: spacing.lg, marginTop: spacing.sm,
    paddingHorizontal: spacing.sm, minHeight: 61, borderRadius: borderRadius.lg,
    backgroundColor: '#ffca30', borderWidth: 3, borderColor: '#fff',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', ...shadows.md },
  shark: { width: 42, height: 50, marginRight: spacing.xs },
  text: { flex: 1 },
  kicker: { color: '#07569e', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.5 },
  title: { color: '#093d77', fontFamily: 'Shark', fontSize: 15, marginTop: 2 },
  action: { color: '#07569e', fontFamily: 'Knockout', fontSize: 11, marginLeft: spacing.xs },
});
