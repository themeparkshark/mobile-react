/**
 * Shark Social look, in the collection book's Alex chrome: the underwater
 * water background, white cards with a navy keyline and a darker lip, gold
 * calls to action, Alex's round FORUM and pencil badges, and HH3 catalog art
 * for topics. Every press springs on the UI thread and has a Reduce Motion path.
 */
import { Image } from 'expo-image';
import { memo, useEffect, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from '../../helpers/haptics';
import { BRAND, SHADOW } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { countFor, shortCount, topicFor, type ReactionState, type TopicKey } from './socialModel';
import type { ReactionTypeType } from '../../models/reaction-type-type';

export const WATER = require('../../../assets/images/shark_background.png');
export const FORUM_ART = require('../../../assets/images/social/forum.png');
export const COMPOSE_ART = require('../../../assets/images/social/compose.png');

export const TOPIC_ART: Readonly<Record<Exclude<TopicKey, 'ask'>, number>> = {
  park_day: require('../../../assets/images/social/topic_park_day.png'),
  rides: require('../../../assets/images/social/topic_rides.png'),
  snacks: require('../../../assets/images/social/topic_snacks.png'),
  outfits: require('../../../assets/images/social/topic_outfits.png'),
  collections: require('../../../assets/images/social/topic_collections.png'),
};
/** "Ask" uses Alex's question badge (the same art as the help button). */
export const ASK_ART = require('../../../assets/images/faq.png');

export function topicArt(key: TopicKey): number {
  return key === 'ask' ? ASK_ART : TOPIC_ART[key];
}

export const INK = BRAND.navy;
export const INK_SOFT = BRAND.navySoft;

// ── Press with a spring ────────────────────────────────────────────────

/** The Pressable itself scales, so layout styles (flex, absolute) apply to the touch area. */
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export function PressScale({
  children,
  onPress,
  onLongPress,
  style,
  scaleTo = 0.95,
  haptic = 'light',
  disabled,
  accessibilityLabel,
  accessibilityHint,
  accessibilityRole = 'button',
  accessibilityState,
  hitSlop,
  testID,
}: {
  readonly children: ReactNode;
  readonly onPress?: () => void;
  readonly onLongPress?: () => void;
  readonly style?: StyleProp<ViewStyle>;
  readonly scaleTo?: number;
  readonly haptic?: 'light' | 'medium' | 'none';
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly accessibilityRole?: 'button' | 'tab' | 'link' | 'none';
  readonly accessibilityState?: { selected?: boolean; disabled?: boolean };
  readonly hitSlop?: number;
  readonly testID?: string;
}) {
  const reduced = useUiReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <AnimatedPressable
      testID={testID}
      style={[style, animated]}
      disabled={disabled}
      hitSlop={hitSlop}
      accessibilityRole={accessibilityRole}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState ?? (disabled ? { disabled: true } : undefined)}
      onPressIn={() => {
        if (!reduced) scale.value = withTiming(scaleTo, { duration: 70 });
      }}
      onPressOut={() => {
        if (!reduced) scale.value = withSpring(1, { damping: 9, stiffness: 320, mass: 0.6 });
      }}
      onPress={() => {
        if (haptic !== 'none') void Haptics.impactAsync(haptic === 'medium' ? 'medium' : 'light');
        onPress?.();
      }}
      onLongPress={onLongPress}
      delayLongPress={350}
    >
      {children}
    </AnimatedPressable>
  );
}

// ── Card ───────────────────────────────────────────────────────────────

export const card = StyleSheet.create({
  shell: {
    backgroundColor: BRAND.white,
    borderRadius: 22,
    borderWidth: 3,
    borderBottomWidth: 6,
    borderColor: '#0a4f9c',
    ...SHADOW.card,
  },
});

// ── Topic badge ───────────────────────────────────────────────────────

export const TopicBadge = memo(function TopicBadge({
  topic,
  onPress,
  size = 'sm',
}: {
  readonly topic: string | null | undefined;
  readonly onPress?: () => void;
  readonly size?: 'sm' | 'md';
}) {
  const def = topicFor(topic);
  if (!def) return null;
  const art = size === 'md' ? 26 : 20;
  const body = (
    <View style={[styles.topic, { backgroundColor: def.chip, borderColor: def.color }]}>
      <Image source={topicArt(def.key)} style={{ width: art, height: art }} contentFit="contain" />
      <Text style={[styles.topicText, size === 'md' && { fontSize: 15 }]}>{def.label}</Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <PressScale onPress={onPress} accessibilityLabel={`${def.label} posts`} accessibilityHint="Shows only posts about this" hitSlop={6}>
      {body}
    </PressScale>
  );
});

// ── Comment chip (Alex's FORUM bubbles) ────────────────────────────────

export function CommentChip({ count, onPress, label = true }: { readonly count: number; readonly onPress?: () => void; readonly label?: boolean }) {
  const content = (
    <View style={styles.commentChip}>
      <Image source={FORUM_ART} style={{ width: 30, height: 30 }} contentFit="contain" />
      <Text style={styles.commentCount}>{shortCount(count)}</Text>
      {label && <Text style={styles.commentWord}>{count === 1 ? 'reply' : 'replies'}</Text>}
    </View>
  );
  if (!onPress) return content;
  return (
    <PressScale onPress={onPress} accessibilityLabel={`${count} ${count === 1 ? 'reply' : 'replies'}. Open post`} hitSlop={6}>
      {content}
    </PressScale>
  );
}

// ── Reaction bar ──────────────────────────────────────────────────────

function ReactionFace({
  type,
  count,
  mine,
  size,
  onPress,
  disabled,
}: {
  readonly type: ReactionTypeType;
  readonly count: number;
  readonly mine: boolean;
  readonly size: number;
  readonly onPress: () => void;
  readonly disabled?: boolean;
}) {
  const reduced = useUiReducedMotion();
  const pop = useSharedValue(1);
  const lift = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));

  useEffect(() => {
    if (mine && !reduced) {
      pop.value = withSequence(withSpring(1.35, { damping: 6, stiffness: 420 }), withSpring(1, { damping: 8, stiffness: 260 }));
    }
  }, [mine, reduced, pop]);

  return (
    <PressScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.85}
      accessibilityLabel={`${type.name}${count ? `, ${count}` : ''}`}
      accessibilityHint={mine ? 'Takes your reaction back' : 'Adds your reaction'}
      accessibilityState={{ selected: mine }}
      hitSlop={4}
      style={[styles.face, mine && styles.faceMine]}
    >
      <Animated.View style={lift}>
        <Image source={{ uri: type.image_url }} style={{ width: size, height: size }} contentFit="contain" />
      </Animated.View>
      {count > 0 && <Text style={[styles.faceCount, mine && { color: '#7a3d00' }]}>{shortCount(count)}</Text>}
    </PressScale>
  );
}

export function ReactionBar({
  state,
  types,
  extraTypes = [],
  onToggle,
  size = 28,
  disabled,
}: {
  readonly state: ReactionState;
  /** Faces offered in the picker (kid-positive set). */
  readonly types: readonly ReactionTypeType[];
  /** Other faces that already have counts (shown, not offered). */
  readonly extraTypes?: readonly ReactionTypeType[];
  readonly onToggle: (typeId: number) => void;
  readonly size?: number;
  readonly disabled?: boolean;
}) {
  const leftovers = extraTypes.filter((type) => countFor(state, type.id) > 0);
  return (
    <View style={styles.reactionRow} accessibilityRole="toolbar" accessibilityLabel="Reactions">
      {types.map((type) => (
        <ReactionFace
          key={type.id}
          type={type}
          size={size}
          count={countFor(state, type.id)}
          mine={state.mine === type.id}
          disabled={disabled}
          onPress={() => onToggle(type.id)}
        />
      ))}
      {leftovers.map((type) => (
        <View key={type.id} style={styles.extraFace} accessibilityLabel={`${type.name}, ${countFor(state, type.id)}`}>
          <Image source={{ uri: type.image_url }} style={{ width: size * 0.7, height: size * 0.7 }} contentFit="contain" />
          <Text style={styles.extraCount}>{countFor(state, type.id)}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Gold call to action ────────────────────────────────────────────────

export function GoldPill({
  label,
  onPress,
  disabled,
  loading,
  accessibilityLabel,
  small,
}: {
  readonly label: string;
  readonly onPress: () => void;
  readonly disabled?: boolean;
  readonly loading?: boolean;
  readonly accessibilityLabel?: string;
  readonly small?: boolean;
}) {
  const reduced = useUiReducedMotion();
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (loading && !reduced) {
      pulse.value = withSequence(withTiming(0.6, { duration: 350 }), withTiming(1, { duration: 350 }));
      const id = setInterval(() => {
        pulse.value = withSequence(withTiming(0.6, { duration: 350 }), withTiming(1, { duration: 350 }));
      }, 720);
      return () => clearInterval(id);
    }
    pulse.value = 1;
    return undefined;
  }, [loading, reduced, pulse]);
  const fade = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <PressScale
      onPress={onPress}
      disabled={disabled || loading}
      haptic="medium"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: Boolean(disabled || loading) }}
      style={[styles.gold, small && styles.goldSmall, (disabled && !loading) && styles.goldDisabled]}
    >
      <Animated.Text style={[styles.goldText, small && { fontSize: 16 }, fade]}>{label}</Animated.Text>
    </PressScale>
  );
}

const styles = StyleSheet.create({
  topic: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    borderWidth: 2,
    paddingLeft: 5,
    paddingRight: 10,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  topicText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy, marginTop: 2 },
  commentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e8f4ff',
    borderRadius: 999,
    paddingLeft: 3,
    paddingRight: 12,
    paddingVertical: 3,
    borderWidth: 2,
    borderColor: '#bfe5ff',
  },
  commentCount: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, marginTop: 2 },
  commentWord: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft, marginTop: 1 },
  reactionRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' },
  face: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 44,
    minWidth: 44,
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  faceMine: { backgroundColor: '#fff1c2', borderColor: BRAND.gold },
  faceCount: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navySoft, marginTop: 2 },
  extraFace: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4, opacity: 0.85 },
  extraCount: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navySoft, marginTop: 2 },
  gold: {
    backgroundColor: BRAND.gold,
    borderRadius: 999,
    borderWidth: 3,
    borderBottomWidth: 5,
    borderColor: '#7a3d00',
    paddingHorizontal: 22,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  goldSmall: { paddingHorizontal: 16, paddingVertical: 4, minHeight: 44 },
  goldDisabled: { backgroundColor: '#f4e2a6', borderColor: '#b9935f' },
  goldText: { fontFamily: 'Shark', fontSize: 20, color: '#7a3d00', marginTop: 3, textTransform: 'uppercase' },
});
