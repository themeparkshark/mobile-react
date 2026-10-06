/**
 * Collection book pieces in Alex's look: springy press, progress ring, set
 * cards, the gold ribbon set header, the book strip, the reward track, the
 * spares meter and a star burst. Logic lives in dexModel.ts. Every move runs
 * on the UI thread and Reduce Motion swaps it for a fade or a still.
 */
import { Image, type ImageSource } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  Easing, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { playSfx } from '../../gamekit/SFX';
import * as Haptics from '../../helpers/haptics';
import prepItemImage from '../../helpers/prepItemImages';
import { BRAND, GameButton, GameIcon, RADIUS, SHADOW } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import {
  prizeChips, progressFraction, rewardTrack, tabStatus, type DexItem, type DexReward, type DexSet,
} from './dexModel';
import type { EventCard } from './eventCards';

export const GIFT = require('../../../assets/images/screens/player/gift.png');
export const RIBBON = require('../../../assets/images/ribbon.png');
export const CLOSE_X = require('../../../assets/images/alex-ui/close-red.webp');
export const WATER = require('../../../assets/images/shark_background.png');

/** Bundled badge art for the legacy sets that never had a server badge. */
const LEGACY_BADGES: Readonly<Record<string, string>> = {
  churro_collection: 'churro_01', pretzel_collection: 'pretzel_01', night_lights: 'flashlight_40',
  rain_parade: 'umbrella_40', camera_crew: 'camera_40',
};

export function setBadge(set: Pick<DexSet, 'slug' | 'badgeUrl'>): ImageSource {
  if (set.badgeUrl) return { uri: set.badgeUrl };
  const local = LEGACY_BADGES[set.slug] ? prepItemImage(LEGACY_BADGES[set.slug]) : null;
  return local ?? GIFT;
}

export function itemArt(item: Pick<DexItem, 'variantSlug' | 'iconUrl'>): ImageSource {
  return (item.variantSlug ? prepItemImage(item.variantSlug) : null)
    ?? (item.iconUrl ? { uri: item.iconUrl } : null)
    ?? GIFT;
}

/** The silhouette ink for missing items. */
export const SILHOUETTE = '#1b3a5c';

/** Squishes on press, springs back on release (a plain press with Reduce Motion). */
export function SpringPress({ onPress, children, style, disabled, accessibilityLabel, accessibilityHint, accessibilityState, scaleTo = 0.94 }: {
  readonly onPress?: () => void;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly disabled?: boolean;
  readonly accessibilityLabel?: string;
  readonly accessibilityHint?: string;
  readonly accessibilityState?: { selected?: boolean; disabled?: boolean; expanded?: boolean };
  readonly scaleTo?: number;
}) {
  const reduced = useUiReducedMotion();
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
      accessibilityState={accessibilityState} disabled={disabled} onPress={onPress}
      onPressIn={() => { if (!reduced) scale.value = withSpring(scaleTo, { damping: 15, stiffness: 420 }); }}
      onPressOut={() => { if (!reduced) scale.value = withSpring(1, { damping: 7, stiffness: 260 }); }}>
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

/** A ring that fills with a color. */
export function ProgressRing({ progress, size, stroke, color, track = 'rgba(255,255,255,0.35)', children }: {
  readonly progress: number; readonly size: number; readonly stroke: number; readonly color: string;
  readonly track?: string; readonly children?: ReactNode;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={track} strokeWidth={stroke} fill="none" />
        {clamped > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={stroke} fill="none"
            strokeLinecap="round" strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={circumference * (1 - clamped)} rotation={-90} origin={`${size / 2}, ${size / 2}`} />
        )}
      </Svg>
      {children}
    </View>
  );
}

export const SET_TAB_WIDTH = 112;
export const SET_TAB_GAP = 12;

/** One set card in the picker: badge in a progress ring and the name. A pill only when the set has news. */
export const SetTab = memo(function SetTab({ set, selected, onPress }: {
  readonly set: DexSet; readonly selected: boolean; readonly onPress: (slug: string) => void;
}) {
  const reduced = useUiReducedMotion();
  const claim = set.reward.status === 'claimable' || set.steps.some(step => step.status === 'claimable');
  const status = tabStatus(set);
  const [badgeFailed, setBadgeFailed] = useState(false);
  const lift = useSharedValue(selected ? 1 : 0);
  useEffect(() => {
    lift.value = reduced ? withTiming(selected ? 1 : 0, { duration: 150 }) : withSpring(selected ? 1 : 0, { damping: 9, stiffness: 210 });
  }, [selected, reduced, lift]);
  const liftStyle = useAnimatedStyle(() => (reduced ? { opacity: 0.85 + 0.15 * lift.value } : {
    opacity: 0.85 + 0.15 * lift.value,
    transform: [{ translateY: -6 * lift.value }, { scale: 0.94 + 0.06 * lift.value }],
  }));
  return (
    <SpringPress onPress={() => onPress(set.slug)} accessibilityState={{ selected }}
      accessibilityLabel={`${set.name}, ${set.found} of ${set.total}${status ? `, ${status.text}` : ''}${set.focused ? ', your hunt' : ''}${claim ? ', reward waiting' : ''}`}
      style={{ marginRight: SET_TAB_GAP }}>
      <Animated.View style={liftStyle}>
        <View style={[styles.tabGlow, selected && styles.tabGlowOn]}>
          <View style={[styles.tabFace, { backgroundColor: set.color }, (set.reward.status === 'claimed' || set.reward.status === 'pending') && styles.tabFaceGold]}>
            <View style={[styles.tabLower, { backgroundColor: 'rgba(5,52,110,0.18)' }]} />
            <LinearGradient colors={['rgba(255,255,255,0.45)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />
            <ProgressRing progress={progressFraction(set)} size={74} stroke={7} color={set.isComplete ? BRAND.gold : BRAND.white}>
              <View style={styles.tabBadgeWell}>
                <Image source={badgeFailed ? GIFT : setBadge(set)} style={styles.tabBadge} contentFit="contain" onError={() => setBadgeFailed(true)} />
              </View>
            </ProgressRing>
            <Text numberOfLines={2} style={styles.tabName} maxFontSizeMultiplier={1.2}>{set.name}</Text>
          </View>
        </View>
        {status && (
          <View style={styles.tabStatus}>
            {status.live ? <View style={styles.liveDot} /> : <GameIcon name={set.status === 'retired' ? 'star' : 'timer'} size={16} />}
            <Text numberOfLines={1} style={styles.tabStatusText} maxFontSizeMultiplier={1.2}>{status.text}</Text>
          </View>
        )}
        {set.focused && <View style={styles.tabHunt}><GameIcon name="search" size={20} /></View>}
        {claim && <View style={styles.tabDot}><GameIcon name="gift" size={22} /></View>}
        {set.isComplete && !claim && <View style={styles.tabDot}><GameIcon name="star" size={22} /></View>}
      </Animated.View>
    </SpringPress>
  );
});

/**
 * An Events card in the same set picker (after the Home Hunt sets): night
 * colors, the event's own art (or a lantern fallback), a haunts ring, and the
 * lifetime haunts count on the newest card. Gold rim when every haunt was
 * done in one night. Opens the event's own card screen.
 */
export const EventTab = memo(function EventTab({ card, lifetimeHaunts, onPress }: {
  readonly card: EventCard; readonly lifetimeHaunts: number | null; readonly onPress: (card: EventCard) => void;
}) {
  const [artFailed, setArtFailed] = useState(false);
  const fraction = card.total > 0 ? card.done / card.total : 0;
  return (
    <SpringPress onPress={() => onPress(card)} style={{ marginRight: SET_TAB_GAP }}
      accessibilityLabel={`${card.cardTitle}, ${card.done} of ${card.total} haunts${lifetimeHaunts != null ? `, ${lifetimeHaunts} haunts all time` : ''}`}>
      <View style={styles.tabGlow}>
        <View style={[styles.tabFace, styles.eventFace, card.tenInOne && styles.tabFaceGold]}>
          <LinearGradient colors={['#2b1f5c', '#0f1636']} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0)']} style={styles.gloss} pointerEvents="none" />
          <ProgressRing progress={fraction} size={74} stroke={7} color={card.complete ? BRAND.gold : '#9df0c2'} track="rgba(255,255,255,0.2)">
            <View style={[styles.tabBadgeWell, styles.eventWell]}>
              {card.art && !artFailed
                ? <Image source={{ uri: card.art }} style={styles.tabBadge} contentFit="contain" onError={() => setArtFailed(true)} />
                : <GameIcon name="star" size={34} />}
            </View>
          </ProgressRing>
          <Text numberOfLines={2} style={styles.tabName} maxFontSizeMultiplier={1.2}>{card.cardTitle}</Text>
        </View>
      </View>
      {lifetimeHaunts != null && lifetimeHaunts > 0 && (
        <View style={[styles.tabStatus, styles.eventPill]}>
          <Text numberOfLines={1} style={styles.tabStatusText} maxFontSizeMultiplier={1.2}>{lifetimeHaunts} haunts</Text>
        </View>
      )}
    </SpringPress>
  );
});

/** The whole book at a glance: found of total with a fill, plus the daily rare when one is waiting. */
export function BookStrip({ found, total, dailyRare, onDaily }: {
  readonly found: number; readonly total: number; readonly dailyRare: boolean; readonly onDaily: () => void;
}) {
  const fraction = total > 0 ? found / total : 0;
  return (
    <View style={styles.bookRow}>
      <View style={styles.bookPanel} accessible accessibilityLabel={`Your book: ${found} of ${total} found`}>
        <GameIcon name="chest" size={34} />
        <View style={{ flex: 1 }}>
          <Text style={styles.bookText}>Book {found}/{total}</Text>
          <View style={styles.bookTrack}><View style={[styles.bookFill, { transform: [{ scaleX: Math.max(0.02, fraction) }] }]} /></View>
        </View>
      </View>
      {dailyRare && (
        <SpringPress onPress={onDaily} accessibilityLabel="Today's rare find is on the map" style={styles.dailyPanel}>
          <GameIcon name="sparkle" size={28} />
          <Text style={styles.dailyText}>Rare{'\n'}today!</Text>
        </SpringPress>
      )}
    </View>
  );
}

/** Gold ribbon with the set name, its badge on the left, the one count ring on the right, and two icon buttons. */
export function SetHeader({ set, onFocus, focusBusy, onOdds, stamp }: {
  readonly set: DexSet; readonly onFocus: (() => void) | null; readonly focusBusy: boolean; readonly onOdds: () => void;
  /** A title just won: stamps onto the ribbon after the reveal closes. */
  readonly stamp?: string | null;
}) {
  const reduced = useUiReducedMotion();
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = 0;
    enter.value = reduced ? withTiming(1, { duration: 150 }) : withSpring(1, { damping: 12, stiffness: 190 });
  }, [set.slug, reduced, enter]);
  const style = useAnimatedStyle(() => (reduced ? { opacity: enter.value }
    : { opacity: enter.value, transform: [{ translateY: (1 - enter.value) * 12 }] }));
  return (
    <Animated.View style={[styles.header, style]}>
      <View style={[styles.headerBadge, { borderColor: set.color }]}>
        <Image source={setBadge(set)} style={{ width: 50, height: 50 }} contentFit="contain" />
      </View>
      <View style={styles.ribbonWrap}>
        <Image source={RIBBON} style={StyleSheet.absoluteFill} contentFit="fill" />
        <Text style={styles.ribbonText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} accessibilityRole="header">{set.name}</Text>
        {!!stamp && <TitleStamp key={stamp} text={stamp} reduced={reduced} />}
      </View>
      <ProgressRing progress={progressFraction(set)} size={62} stroke={7} color={set.isComplete ? BRAND.gold : set.color} track="#d5e6f6">
        <View style={styles.countWell} accessible accessibilityLabel={`${set.found} of ${set.total} found`}>
          <Text style={styles.countBig} maxFontSizeMultiplier={1.2}>{set.found}</Text>
          <Text style={styles.countSmall} maxFontSizeMultiplier={1.2}>/{set.total}</Text>
        </View>
      </ProgressRing>
      <View style={styles.headerButtons}>
        {onFocus && (
          <SpringPress onPress={onFocus} disabled={focusBusy} accessibilityState={{ selected: set.focused }}
            accessibilityLabel={set.focused ? 'Hunting this set first. Tap to hunt all sets.' : 'Hunt this set first'}
            style={[styles.iconButton, set.focused && styles.iconButtonOn]}>
            <GameIcon name="search" size={26} />
          </SpringPress>
        )}
        <SpringPress onPress={onOdds} accessibilityLabel="How rare is each find?" style={styles.iconButton}>
          <GameIcon name="info" size={26} />
        </SpringPress>
      </View>
    </Animated.View>
  );
}

function TitleStamp({ text, reduced }: { readonly text: string; readonly reduced: boolean }) {
  const t = useSharedValue(reduced ? 1 : 1.6);
  useEffect(() => {
    // Slams from 1.6 to 1 with a thud and a heavy haptic.
    const timer = setTimeout(() => {
      playSfx('fx.hit', 0.8);
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
    }, reduced ? 0 : 170);
    if (!reduced) t.value = withSequence(withTiming(1, { duration: 170, easing: Easing.in(Easing.quad) }), withSequence(withTiming(1.06, { duration: 70 }), withSpring(1, { damping: 8, stiffness: 300 })));
    return () => clearTimeout(timer);
  }, [reduced, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: t.value }, { rotate: '-7deg' }] }));
  return (
    // The transform lives on a bare wrapper: iOS left a stale scaled copy of the bordered plate when both shared one view.
    <Animated.View style={[styles.titleStampWrap, style]} accessible accessibilityLabel={`New title: ${text}`}>
      <View style={styles.titleStamp}>
      <GameIcon name="crown" size={22} />
      <Text style={styles.titleStampText} numberOfLines={1}>{text}</Text>
    </View>
    </Animated.View>
  );
}

/** Small icon chip: "After sunset" with a star, "Rainy days" with a sparkle. Only for special timing. */
export function StatusChip({ text, icon }: { readonly text: string; readonly icon: 'star' | 'timer' | 'sparkle' | 'map' }) {
  return (
    <View style={styles.chip}>
      <GameIcon name={icon} size={22} />
      <Text numberOfLines={1} style={styles.chipText} maxFontSizeMultiplier={1.2}>{text}</Text>
    </View>
  );
}

export const spareWord = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** A count that ticks to its new value with a small pop when fresh data replaces the cached number. */
function AnimatedCount({ value, style, suffix }: { readonly value: number; readonly style: StyleProp<TextStyle>; readonly suffix: string }) {
  const reduced = useUiReducedMotion();
  const [shown, setShown] = useState(value);
  const pop = useSharedValue(1);
  const last = useRef(value);
  useEffect(() => {
    const from = last.current;
    last.current = value;
    if (from === value) return;
    if (reduced) { setShown(value); return; }
    pop.value = withSequence(withTiming(1.2, { duration: 110 }), withSpring(1, { damping: 7, stiffness: 260 }));
    const steps = Math.min(8, Math.abs(value - from));
    let i = 0;
    const timer = setInterval(() => {
      i += 1;
      setShown(Math.round(from + ((value - from) * i) / steps));
      if (i >= steps) clearInterval(timer);
    }, 45);
    return () => { clearInterval(timer); setShown(value); };
  }, [value, reduced, pop]);
  const style2 = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return <Animated.Text style={[style, style2]} maxFontSizeMultiplier={1.2}>{shown}{suffix}</Animated.Text>;
}

/** The spare count: extra copies of finds already owned. Spares never swap for a missing item (rare finds are earned on the map). */
export function SparesMeter({ spares, onPress }: { readonly spares: number; readonly onPress: () => void }) {
  return (
    <SpringPress onPress={onPress} style={styles.meterPlaque}
      accessibilityLabel={`${spareWord(spares, 'spare copy', 'spare copies')}. Tap to see what spares are for.`}>
      <GameIcon name="gift" size={28} />
      <AnimatedCount value={spares} style={styles.meterCount} suffix={spares === 1 ? ' spare' : ' spares'} />
    </SpringPress>
  );
}

/** Prize icons with numbers (never a sentence). */
export function PrizeRow({ reward, size = 22, done = false }: { readonly reward: DexReward; readonly size?: number; readonly done?: boolean }) {
  return (
    <View style={styles.prizeRow} accessible accessibilityLabel={reward.label}>
      {prizeChips(reward).map(prize => (
        <View key={prize.icon} style={[styles.prize, done && styles.prizeDone]}>
          <GameIcon name={prize.icon} size={size} />
          <Text style={styles.prizeText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{prize.value}</Text>
          {done && <View style={styles.prizeCheck}><GameIcon name="check" size={16} /></View>}
        </View>
      ))}
    </View>
  );
}

/**
 * One track for the set: a fill to "found", a node per reward (earlier steps at
 * their target, the finish reward at the end). A ready node bounces and glows;
 * tapping it claims. Done: the track turns gold with "You got it!".
 */
export function RewardTrack({ set, busyId, onClaim, titleWorn, titleBusy, onTitle, popKey }: {
  readonly set: DexSet; readonly busyId: string | null; readonly onClaim: (reward: DexReward) => void;
  readonly titleWorn: boolean; readonly titleBusy: boolean; readonly onTitle: (() => void) | null; readonly popKey: number;
}) {
  const reduced = useUiReducedMotion();
  const nodes = rewardTrack(set);
  const finished = set.reward.status === 'claimed' || set.reward.status === 'pending';
  const fraction = progressFraction(set);
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = reduced ? fraction : withTiming(fraction, { duration: 650, easing: Easing.out(Easing.cubic) });
  }, [fraction, reduced, fill]);
  // scaleX on a full-width bar: no layout work per frame.
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: Math.max(0.001, fill.value) }] }));
  const pop = useSharedValue(1);
  useEffect(() => {
    if (popKey === 0 || reduced) return;
    pop.value = withSequence(withTiming(1.06, { duration: 120 }), withSpring(1, { damping: 6, stiffness: 220 }));
  }, [popKey, reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const ready = nodes.find(node => node.reward.status === 'claimable')?.reward ?? null;
  const next = ready ?? nodes.find(node => node.reward.status === 'locked')?.reward ?? set.reward;
  return (
    <Animated.View style={[styles.trackWrap, popStyle]}>
      <View style={styles.trackRibbon}>
        <Image source={RIBBON} style={StyleSheet.absoluteFill} contentFit="fill" />
        <GameIcon name={finished ? 'check' : ready ? 'gift' : 'trophy'} size={26} />
        <Text style={styles.trackTitle} maxFontSizeMultiplier={1.2}>{finished ? 'You got it!' : ready ? 'Tap to claim!' : 'Finish the set'}</Text>
      </View>
      <View style={[styles.trackPanel, finished && styles.trackPanelDone]}>
      <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} style={styles.blueGloss} pointerEvents="none" />
      <View style={styles.trackLine}>
        <View style={styles.trackBar}>
          <Animated.View style={[styles.trackFill, { backgroundColor: finished ? BRAND.navy : set.color }, fillStyle]} />
        </View>
        {nodes.map(node => (
          <TrackNodeView key={node.reward.id} node={node} busy={busyId === node.reward.id} reduced={reduced} onClaim={onClaim} />
        ))}
      </View>
      <PrizeRow reward={next} done={finished && next === set.reward} />
      {ready && (
        <GameButton label={ready.needsPick ? 'Pick and claim' : 'Claim!'} icon="gift"
          loading={busyId === ready.id} onPress={() => onClaim(ready)} style={{ marginTop: 10 }}
          accessibilityLabel={`Claim ${ready.label}`} />
      )}
      {set.reward.status === 'pending' && <Text style={styles.trackNote}>Your shark item is on the way.</Text>}
      {finished && onTitle && set.reward.title && (
        // A white plaque, so it reads as a button on the gold done panel (a gold button there looked like panel art).
        <SpringPress onPress={onTitle} disabled={titleBusy} accessibilityLabel={titleWorn ? 'Take off title' : `Wear title: ${set.reward.title}`}
          style={[styles.titleButton, titleBusy && { opacity: 0.6 }]}>
          <GameIcon name="crown" size={28} />
          <Text style={styles.titleButtonText} maxFontSizeMultiplier={1.2}>{titleWorn ? 'Take off title' : 'Wear title'}</Text>
        </SpringPress>
      )}
      </View>
    </Animated.View>
  );
}

function TrackNodeView({ node, busy, reduced, onClaim }: {
  readonly node: { reward: DexReward; at: number; final: boolean }; readonly busy: boolean; readonly reduced: boolean;
  readonly onClaim: (reward: DexReward) => void;
}) {
  const ready = node.reward.status === 'claimable';
  const done = node.reward.status === 'claimed' || node.reward.status === 'pending';
  const bounce = useSharedValue(0);
  useEffect(() => {
    if (!ready || reduced) { bounce.value = 0; return; }
    bounce.value = withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0, { duration: 380 })), -1, false);
  }, [ready, reduced, bounce]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -6 * bounce.value }, { scale: 1 + 0.08 * bounce.value }] }));
  const icon = node.final ? 'trophy' : 'gift';
  return (
    <Animated.View style={[styles.node, { left: `${node.at * 100}%` }, style]}>
      <Pressable accessibilityRole="button" disabled={!ready || busy} onPress={() => onClaim(node.reward)} hitSlop={10}
        accessibilityLabel={`${node.final ? 'Finish the set' : `Find ${node.reward.target}`}: ${node.reward.prize}. ${ready ? 'Ready to claim' : done ? 'Claimed' : 'Locked'}`}
        style={[styles.nodeBall, ready && styles.nodeReady, done && styles.nodeDone]}>
        <GameIcon name={done ? 'check' : ready ? icon : node.final ? 'trophy' : 'lock'} size={26} />
      </Pressable>
      {!node.final && <Text style={styles.nodeLabel}>{node.reward.target}</Text>}
    </Animated.View>
  );
}

/** A small burst of stars. Mount with a new key to fire. Skipped with Reduce Motion. */
export function StarBurst({ color = BRAND.gold, size = 160, solid = false }: {
  readonly color?: string; readonly size?: number;
  /** Opaque two-tone sparks (gold and pale gold, outlined) that pop out instead of fading: they never go khaki on navy. */
  readonly solid?: boolean;
}) {
  const reduced = useUiReducedMotion();
  const parts = useMemo(() => Array.from({ length: 10 }, (_, index) => (index / 10) * Math.PI * 2), []);
  if (reduced) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}>
      {parts.map((angle, index) => (
        <Spark key={index} angle={angle} distance={size / 2} delay={index * 12} solid={solid}
          color={solid ? (index % 2 ? BRAND.goldLight : color) : index % 2 ? BRAND.white : color} />
      ))}
    </View>
  );
}

function Spark({ angle, distance, color, delay, solid }: { angle: number; distance: number; color: string; delay: number; solid: boolean }) {
  const t = useSharedValue(0);
  useEffect(() => { t.value = withDelay(delay, withTiming(1, { duration: 620, easing: Easing.out(Easing.quad) })); }, [t, delay]);
  const style = useAnimatedStyle(() => ({
    opacity: solid ? (t.value < 0.8 ? 1 : (1 - t.value) * 5) : 1 - t.value,
    transform: [
      { translateX: Math.cos(angle) * distance * t.value },
      { translateY: Math.sin(angle) * distance * t.value },
      { scale: 0.4 + t.value * 0.8 },
      { rotate: '45deg' },
    ],
  }));
  return <Animated.View style={[styles.spark, solid && styles.sparkSolid, { backgroundColor: color }, style]} />;
}

/** The Alex-style blue popup body: flat blue, darker lip, one gloss band. */
export function BluePanel({ children, style }: { readonly children: ReactNode; readonly style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.bluePanel, style]}>
      <LinearGradient colors={['rgba(255,255,255,0.22)', 'rgba(255,255,255,0)']} style={styles.blueGloss} pointerEvents="none" />
      {children}
    </View>
  );
}

/** Darker shade of a #RRGGBB color. */
export function shade(hex: string, amount = 0.28): string {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return hex;
  const value = parseInt(match[1], 16);
  const channel = (shift: number) => Math.max(0, Math.round(((value >> shift) & 255) * (1 - amount)));
  return `#${[16, 8, 0].map(shift => channel(shift).toString(16).padStart(2, '0')).join('')}`;
}

const styles = StyleSheet.create({
  tabGlow: { borderRadius: 26, padding: 3 },
  tabGlowOn: { backgroundColor: BRAND.white, ...SHADOW.card, shadowColor: BRAND.white, shadowOpacity: 0.9, shadowRadius: 10 },
  tabFace: {
    width: SET_TAB_WIDTH, height: 148, borderRadius: 22, alignItems: 'center', paddingTop: 12, overflow: 'hidden',
    borderWidth: 3, borderColor: 'rgba(5,52,110,0.55)', borderBottomWidth: 6,
  },
  eventFace: { backgroundColor: '#1b1747', borderColor: '#8f7cff' },
  eventWell: { backgroundColor: 'rgba(15,22,54,0.85)' },
  eventPill: { borderColor: '#2b1f5c' },
  tabFaceGold: { borderColor: BRAND.gold, borderBottomColor: BRAND.goldLip, borderWidth: 4, borderBottomWidth: 7 },
  tabLower: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '30%' },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '46%' },
  tabBadgeWell: { width: 54, height: 54, borderRadius: 27, backgroundColor: 'rgba(255,255,255,0.94)', alignItems: 'center', justifyContent: 'center' },
  tabBadge: { width: 46, height: 46 },
  tabName: {
    fontFamily: 'Shark', fontSize: 15, lineHeight: 17, color: BRAND.white, marginTop: 6, paddingHorizontal: 6, textAlign: 'center',
    textShadowColor: 'rgba(5,52,110,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  tabStatus: {
    position: 'absolute', bottom: -12, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 9,
    height: 26, borderRadius: 13, backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.navy, maxWidth: 118,
  },
  tabStatusText: { fontFamily: 'Knockout', fontSize: 14, color: BRAND.navy, flexShrink: 1 },
  liveDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#22b357', borderWidth: 1.5, borderColor: BRAND.white },
  tabHunt: {
    position: 'absolute', top: 6, left: 6, width: 34, height: 34, borderRadius: 17, backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND.blue,
  },
  tabDot: {
    position: 'absolute', top: 6, right: 6, width: 34, height: 34, borderRadius: 17, backgroundColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND.gold,
  },
  bookRow: { flexDirection: 'row', gap: 10, marginHorizontal: 16, marginTop: 12 },
  bookPanel: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingHorizontal: 12, borderRadius: 18,
    backgroundColor: '#0b6fc4', borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 6, borderBottomColor: '#cfe6fb',
  },
  bookText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.white },
  bookTrack: { height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden', marginTop: 4 },
  bookFill: { height: '100%', width: '100%', backgroundColor: BRAND.gold, transformOrigin: 'left' },
  dailyPanel: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 56, paddingHorizontal: 12, borderRadius: 18,
    backgroundColor: BRAND.gold, borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 6, borderBottomColor: BRAND.goldLip,
  },
  dailyText: { fontFamily: 'Shark', fontSize: 15, lineHeight: 16, color: '#7a3d00' },
  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 4, gap: 4 },
  headerBadge: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 4, backgroundColor: BRAND.white, alignItems: 'center',
    justifyContent: 'center', zIndex: 2, ...SHADOW.card,
  },
  ribbonWrap: { flex: 1, height: 58, marginLeft: -16, justifyContent: 'center', paddingLeft: 26, paddingRight: 16 },
  ribbonText: { fontFamily: 'Shark', fontSize: 23, color: '#7a3d00', marginTop: -6 },
  titleStampWrap: { position: 'absolute', right: 4, bottom: -18 },
  titleStamp: {
    flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10,
    height: 34, borderRadius: 9, backgroundColor: BRAND.gold, borderWidth: 3, borderColor: '#7a3d00', borderBottomWidth: 5,
    maxWidth: 190,
  },
  titleStampText: { fontFamily: 'Shark', fontSize: 16, color: '#7a3d00', flexShrink: 1 },
  countWell: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' },
  countBig: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  countSmall: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navySoft },
  headerButtons: { flexDirection: 'column', gap: 6, marginLeft: 4 },
  iconButton: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.sky,
    alignItems: 'center', justifyContent: 'center',
  },
  iconButtonOn: { backgroundColor: BRAND.gold, borderColor: BRAND.white },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, minHeight: 44, borderRadius: RADIUS.pill,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#bcd9f2',
  },
  chipText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, flexShrink: 1 },
  meterPlaque: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 12, borderRadius: 16,
    backgroundColor: '#1a8fe3', borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 6, borderBottomColor: '#0b5aa0',
  },
  meterCount: {
    fontFamily: 'Shark', fontSize: 16, color: BRAND.white,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  prizeRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 6, marginTop: 6 },
  prize: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 9, borderRadius: 12,
    backgroundColor: '#1a8fe3', borderWidth: 2, borderColor: BRAND.white, borderBottomWidth: 5, borderBottomColor: '#0b5aa0',
    maxWidth: 220,
  },
  prizeDone: { borderColor: '#bff0cd' },
  prizeText: {
    fontFamily: 'Shark', fontSize: 16, color: BRAND.gold, flexShrink: 1,
    textShadowColor: '#05346e', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  prizeCheck: { position: 'absolute', top: -8, right: -8 },
  trackWrap: { marginHorizontal: 16, marginTop: 14 },
  trackRibbon: {
    alignSelf: 'center', width: 250, height: 52, zIndex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingBottom: 6, marginBottom: -22,
  },
  trackPanel: {
    paddingHorizontal: 12, paddingTop: 26, paddingBottom: 12, borderRadius: 20, backgroundColor: '#1a8fe3', overflow: 'hidden',
    borderWidth: 4, borderColor: BRAND.white, borderBottomWidth: 8, borderBottomColor: '#0b5aa0',
  },
  titleButton: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'center', marginTop: 12,
    minHeight: 50, paddingHorizontal: 22, borderRadius: 25, backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.navy,
    borderBottomWidth: 6,
  },
  titleButtonText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  trackPanelDone: { backgroundColor: '#e8a700', borderBottomColor: '#a87700' },
  trackTitle: { fontFamily: 'Shark', fontSize: 19, color: '#7a3d00' },
  trackLine: { height: 50, justifyContent: 'center', marginTop: 2, marginHorizontal: 18 },
  trackBar: { height: 14, borderRadius: 7, backgroundColor: '#0b5aa0', overflow: 'hidden', borderWidth: 2, borderColor: BRAND.white },
  trackFill: { height: '100%', width: '100%', transformOrigin: 'left' },
  trackNote: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.white, marginTop: 8, textAlign: 'center' },
  node: { position: 'absolute', top: 2, marginLeft: -22, alignItems: 'center' },
  nodeBall: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND.white, borderWidth: 3, borderColor: '#c8d9ea',
    alignItems: 'center', justifyContent: 'center',
  },
  nodeReady: { borderColor: BRAND.gold, backgroundColor: '#fff3c4', ...SHADOW.card, shadowColor: BRAND.gold, shadowOpacity: 0.9, shadowRadius: 8 },
  nodeDone: { borderColor: BRAND.green, backgroundColor: '#eafbef' },
  nodeLabel: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white, marginTop: -2 },
  spark: { position: 'absolute', width: 14, height: 14, borderRadius: 3 },
  sparkSolid: { width: 16, height: 16, borderWidth: 2, borderColor: '#7a3d00' },
  bluePanel: {
    backgroundColor: '#1a8fe3', borderRadius: 22, borderWidth: 4, borderColor: BRAND.white, borderBottomWidth: 8,
    borderBottomColor: '#0b5aa0', overflow: 'hidden',
  },
  blueGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '35%' },
});
