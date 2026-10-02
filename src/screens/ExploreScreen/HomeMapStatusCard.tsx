import { useEffect, useRef } from 'react';
import { Image } from 'expo-image';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { GameIcon, GameRichText } from '../../ui';

interface Props {
  readonly mode: 'loading' | 'empty' | 'error' | 'saved' | 'park_check';
  readonly onRetry?: () => void;
  readonly onOpenCollections?: () => void;
  /** Sit in the parent's layout (the home map's bottom slot) instead of floating. */
  readonly inline?: boolean;
  /** "#12 Orlando Area · 340 pts". Shown only when the server sent it (Home Hunt). */
  readonly rankLine?: string | null;
  /** Tap on the rank line opens Standings on the Home Hunt tab. */
  readonly onOpenStandings?: () => void;
}

/** A shark-led status for the moments between live GPS finds. */
/** The one Home Hunt rank line. Renders nothing unless the server sent a line. */
function RankLine({ line, onPress, light }: { readonly line?: string | null; readonly onPress?: () => void; readonly light?: boolean }) {
  if (!line) return null;
  return <Pressable accessibilityRole="button" accessibilityLabel={`Home Hunt rank. ${line}. Open Standings`}
    disabled={!onPress} onPress={onPress} hitSlop={8} style={styles.rankLine}>
    <Text numberOfLines={1} style={[styles.rankLineText, light && { color: '#ffe06c' }]}>{line}</Text>
  </Pressable>;
}

export default function HomeMapStatusCard({ mode, onRetry, onOpenCollections, inline = false, rankLine, onOpenStandings }: Props) {
  // The card itself never animates. A native-driven scale pop on this
  // bordered, rounded card left the blue fill at its starting 0.92 scale on
  // device (Fabric) while the white border and text laid out at full size,
  // so the copy ran past the visible card. Only the shark floats.
  const sharkFloat = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (mode !== 'loading') {
      sharkFloat.setValue(0);
      return;
    }
    const float = Animated.loop(Animated.sequence([
      Animated.timing(sharkFloat, { toValue: -5, duration: 750, useNativeDriver: true }),
      Animated.timing(sharkFloat, { toValue: 0, duration: 750, useNativeDriver: true }),
    ]));
    float.start();
    return () => float.stop();
  }, [mode, sharkFloat]);

  if (mode === 'saved') return <View style={[styles.savedCard, inline && styles.inline]}>
    <Image source={require('../../../assets/images/screens/pin-collections/shark.png')}
      style={styles.savedShark} contentFit="contain" />
    <View style={styles.savedCopy}>
      <Text style={styles.savedTitle}>SAVED MAP</Text>
      <Text style={styles.savedDetail}>Reconnect to collect these finds.</Text>
      <RankLine line={rankLine} onPress={onOpenStandings} light />
    </View>
    {onRetry && <Pressable accessibilityRole="button"
      accessibilityLabel="Refresh saved home map" onPress={onRetry}
      style={styles.savedButton}>
      <Text style={styles.savedButtonText}>RETRY</Text>
    </Pressable>}
  </View>;

  const title = mode === 'park_check' ? 'CHECKING YOUR MAP'
    : mode === 'loading' ? 'SCOUTING THE MAP'
    : mode === 'error' ? 'MAP SIGNAL LOST' : 'THE HUNT IS QUIET';
  const detail = mode === 'park_check' ? 'Home finds return when your location is confirmed outside a park.'
    : mode === 'loading' ? 'Looking for nearby finds...'
    : mode === 'error' ? 'Could not refresh nearby finds.'
      : 'Check your collection while new finds appear.';

  return <View style={[styles.card, inline && styles.inline]}>
    <Animated.View style={[styles.sharkFrame, { transform: [{ translateY: sharkFloat }] }]}>
      <Image source={require('../../../assets/images/screens/pin-collections/shark.png')}
        style={styles.shark} contentFit="contain" />
    </Animated.View>
    <View style={styles.copy}>
      <Text style={styles.kicker}>{mode === 'park_check' ? 'LOCATION CHECK' : 'HOME EXPLORER'}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>
      <RankLine line={rankLine} onPress={onOpenStandings} light />
      {mode === 'empty' && onOpenCollections && <Pressable accessibilityRole="button"
        accessibilityLabel="Open home collections" onPress={onOpenCollections}
        style={styles.button}>
        <GameRichText style={styles.buttonText} iconSize={14}>{'COLLECTIONS [icon:arrow]'}</GameRichText>
      </Pressable>}
      {mode === 'error' && onRetry && <Pressable accessibilityRole="button"
        accessibilityLabel="Refresh nearby prep items" onPress={onRetry}
        style={styles.button}>
        <GameRichText style={styles.buttonText} iconSize={14}>{'TRY AGAIN [icon:arrow]'}</GameRichText>
      </Pressable>}
    </View>
    {mode === 'empty' && onRetry && <Pressable accessibilityRole="button"
      accessibilityLabel="Refresh nearby prep items" onPress={onRetry}
      style={styles.refreshButton}>
      <GameIcon name="retry" size={22} accessibilityLabel="Refresh" />
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  inline: { position: 'relative', bottom: undefined, alignSelf: 'stretch', width: undefined },
  savedCard: { position: 'absolute', bottom: 207, alignSelf: 'center', zIndex: 12,
    width: 268, minHeight: 66, flexDirection: 'row', alignItems: 'center',
    borderRadius: 16, borderWidth: 3, borderColor: '#fff', backgroundColor: '#0879ca',
    shadowColor: '#003c7a', shadowOpacity: 0.3, shadowOffset: { width: 0, height: 4 },
    shadowRadius: 4, elevation: 6, paddingHorizontal: 6 },
  savedShark: { width: 48, height: 55, marginRight: 4 },
  savedCopy: { flex: 1, minWidth: 0 },
  savedTitle: { color: '#fff', fontFamily: 'Shark', fontSize: 14 },
  savedDetail: { color: '#e4f5ff', fontFamily: 'Knockout', fontSize: 12, lineHeight: 14 },
  savedButton: { backgroundColor: '#ffca30', borderColor: '#fff', borderWidth: 2,
    borderRadius: 9, paddingHorizontal: 7, paddingVertical: 6, marginLeft: 5 },
  savedButtonText: { color: '#093d77', fontFamily: 'Shark', fontSize: 11 },
  card: { position: 'absolute', bottom: 285, alignSelf: 'center', zIndex: 12,
    width: 295, minHeight: 82, flexDirection: 'row', alignItems: 'center',
    borderRadius: 18, borderWidth: 3, borderColor: '#fff', backgroundColor: '#0879ca',
    shadowColor: '#003c7a', shadowOpacity: 0.32, shadowOffset: { width: 0, height: 5 },
    shadowRadius: 5, elevation: 6, padding: 7 },
  sharkFrame: { width: 58, height: 70, marginRight: 5 },
  shark: { width: 58, height: 70 },
  copy: { flex: 1, minWidth: 0 },
  kicker: { color: '#ffe06c', fontFamily: 'Knockout', fontSize: 11, letterSpacing: 0.4 },
  title: { color: '#fff', fontFamily: 'Shark', fontSize: 15, marginTop: 1 },
  detail: { color: '#e4f5ff', fontFamily: 'Knockout', fontSize: 12,
    lineHeight: 15, marginTop: 2, flexShrink: 1 },
  button: { alignSelf: 'flex-start', backgroundColor: '#ffca30',
    borderColor: '#fff', borderWidth: 2, borderRadius: 9,
    paddingHorizontal: 7, paddingVertical: 3, marginTop: 4 },
  buttonText: { color: '#093d77', fontFamily: 'Shark', fontSize: 11 },
  refreshButton: { alignSelf: 'flex-end', justifyContent: 'center', alignItems: 'center',
    width: 30, height: 30, marginLeft: 2, borderRadius: 15,
    borderWidth: 2, borderColor: '#9ddcff', backgroundColor: '#07569e' },
  rankLine: { alignSelf: 'flex-start', marginTop: 3 },
  rankLineText: { color: '#ffe06c', fontFamily: 'Shark', fontSize: 12 },
  refreshText: { color: '#fff', fontSize: 25, lineHeight: 28, marginTop: -2 },
});
