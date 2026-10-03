/**
 * The Profile's row of round shortcut badges (Shark Shop, Stamp Book, Pin
 * Packs, Secret Store) and the same row of actions on another player's page.
 *
 * - Every badge is Alex's round store frame at one size, with one label style
 *   (Knockout, one line, never wraps, shrinks a little before it truncates).
 * - Up to 4 badges share the width in equal columns, so nothing scrolls or
 *   hides. More than 4 scroll sideways with the 5th badge peeking in as the
 *   cue.
 * - A badge the player cannot open yet (Secret Store without VIP) wears a gold
 *   lock and says what happens on tap ("Opens VIP").
 * - Press: spring squash, light haptic and the button sound. Reduce Motion
 *   keeps the haptic and sound and skips the squash.
 */
import { Image, type ImageSource } from 'expo-image';
import { memo, useContext, useRef } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SoundEffectContext, SoundEffectContextType } from '../../context/SoundEffectProvider';
import HapticPatterns from '../../helpers/hapticPatterns';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';

export type ProfileShortcut = {
  readonly key: string;
  readonly label: string;
  readonly image: ImageSource | number | string | undefined;
  readonly onPress: () => void;
  /** Spoken after the label, e.g. "Opens the daily shop". */
  readonly hint?: string;
  /** Shows a gold lock; the tap still runs onPress (which can open the upsell). */
  readonly locked?: boolean;
  /** A small red dot (something new inside). */
  readonly dot?: boolean;
};

const BADGE_RATIO = 386 / 363; // Alex's store frame art
const MAX_COLUMNS = 4;
const GAP = 8;

const Badge = memo(function Badge({ item, width, reduced }: {
  item: ProfileShortcut; width: number; reduced: boolean;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const scale = useRef(new Animated.Value(1)).current;
  const art = Math.min(76, Math.round(width - 8));
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.locked ? `${item.label}, locked` : item.label}
      accessibilityHint={item.hint}
      hitSlop={4}
      onPressIn={() => {
        if (reduced) return;
        Animated.spring(scale, { toValue: 0.88, speed: 60, bounciness: 0, useNativeDriver: true }).start();
      }}
      onPressOut={() => {
        if (reduced) return;
        Animated.spring(scale, { toValue: 1, speed: 14, bounciness: 14, useNativeDriver: true }).start();
      }}
      onPress={() => {
        HapticPatterns.buttonTap();
        playSound(require('../../../assets/sounds/button_press.mp3'));
        item.onPress();
      }}
      style={{ width, alignItems: 'center' }}
    >
      <Animated.View style={{ width: art, height: art * BADGE_RATIO, transform: [{ scale }] }}>
        <Image source={item.image} style={StyleSheet.absoluteFill} contentFit="contain"
          transition={120} cachePolicy="memory-disk" />
        {item.locked && (
          <View style={styles.lock}>
            <Image source={require('../../../assets/images/locked.png')} style={{ width: 18, height: 18 }}
              contentFit="contain" />
          </View>
        )}
        {item.dot && !item.locked && <View style={styles.dot} />}
      </Animated.View>
      <Text style={styles.label} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.78}
        maxFontSizeMultiplier={1.3}>
        {item.label}
      </Text>
    </Pressable>
  );
});

export default function ProfileShortcuts({ items, horizontalPadding = 16, loading = false }: {
  readonly items: ProfileShortcut[];
  /** The screen padding around the row, to size equal columns. */
  readonly horizontalPadding?: number;
  /** Hold the row's space with quiet placeholders until the list is known. */
  readonly loading?: boolean;
}) {
  const reduced = useReducedGameMotion();
  const { width: screenW } = useWindowDimensions();
  const inner = screenW - horizontalPadding * 2;
  const col = Math.floor((inner - GAP * (MAX_COLUMNS - 1)) / MAX_COLUMNS);

  if (loading) {
    const art = Math.min(76, col - 8);
    return (
      <View style={[styles.row, { gap: GAP }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: MAX_COLUMNS }, (_, i) => (
          <View key={i} style={{ width: col, alignItems: 'center' }}>
            <View style={{ width: art, height: art, borderRadius: art / 2, backgroundColor: '#c9e6f8', marginBottom: art * (BADGE_RATIO - 1) }} />
            <View style={{ width: col * 0.7, height: 12, borderRadius: 6, backgroundColor: '#c9e6f8', marginTop: 9 }} />
          </View>
        ))}
      </View>
    );
  }
  if (items.length === 0) return null;

  if (items.length <= MAX_COLUMNS) {
    return (
      <View style={[styles.row, { gap: GAP }]}>
        {items.map((item) => <Badge key={item.key} item={item} width={col} reduced={reduced} />)}
      </View>
    );
  }

  // Five or more: 4.4 columns visible, so the next badge peeks in.
  const peekCol = Math.floor((inner - GAP * 4) / 4.4);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={{ marginHorizontal: -horizontalPadding }}
      contentContainerStyle={{ paddingHorizontal: horizontalPadding, gap: GAP }}
      decelerationRate="fast"
      snapToInterval={peekCol + GAP}
    >
      {items.map((item) => <Badge key={item.key} item={item} width={peekCol} reduced={reduced} />)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'center' },
  label: {
    marginTop: 4,
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#05346e',
    textTransform: 'uppercase',
    textAlign: 'center',
    letterSpacing: 0.3,
    alignSelf: 'stretch',
  },
  lock: {
    position: 'absolute',
    right: 0,
    bottom: 6,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ffcf3b',
    borderWidth: 2,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#05346e',
    shadowOpacity: 0.25,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
  dot: {
    position: 'absolute',
    right: 4,
    top: 4,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#ff3b30',
    borderWidth: 2,
    borderColor: '#ffffff',
  },
});
