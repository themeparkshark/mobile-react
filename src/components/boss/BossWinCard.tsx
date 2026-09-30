import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation, Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { BOSS_NAMES, type BossRaid } from '../../api/endpoints/parks/raid';
import { haptic } from '../../gamekit/Haptics';
import { ParticleField, type ParticleHandle } from '../../gamekit/Particles';
import { playSfx } from '../../gamekit/SFX';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameButton, GameIcon, type GameIconName } from '../../ui';
import { BOSS_ART } from './bossArt';
import { BossHpBar } from './BossSheetParts';

const CARD_W = 340, CARD_H = 520;

type Loot = { key: string; icon: GameIconName; amount: number; label: string; detail?: string };

export function lootFor(raid: BossRaid): Loot[] {
  const r = raid.you.reward;
  if (!r) return [];
  return [
    { key: 'coins', icon: 'coins' as const, amount: r.coins, label: 'Shark Coins' },
    { key: 'xp', icon: 'xp' as const, amount: r.xp, label: 'XP' },
    { key: 'energy', icon: 'energy' as const, amount: r.energy, label: 'Energy' },
    { key: 'parts', icon: 'parts' as const, amount: r.parts, label: 'Ride Parts', detail: raid.ride_name ?? undefined },
    { key: 'tickets', icon: 'ticket' as const, amount: r.tickets, label: r.tickets === 1 ? 'Park Ticket' : 'Park Tickets' },
  ].filter(item => item.amount > 0);
}

/** Counts up from 0 on the JS thread (a few frames per chip), instantly under reduced motion. */
function CountUp({ to, start, reduced }: { readonly to: number; readonly start: boolean; readonly reduced: boolean }) {
  const [value, setValue] = useState(reduced ? to : 0);
  useEffect(() => {
    if (reduced) { setValue(to); return; }
    if (!start) return;
    const began = Date.now(), duration = Math.min(700, 250 + to * 4);
    const id = setInterval(() => {
      const t = Math.min(1, (Date.now() - began) / duration);
      setValue(Math.round(to * (1 - (1 - t) ** 3)));
      if (t >= 1) clearInterval(id);
    }, 33);
    return () => clearInterval(id);
  }, [to, start, reduced]);
  return <Text style={styles.lootAmount}>+{value.toLocaleString()}</Text>;
}

function LootChip({ item, index, reduced, collecting }: { readonly item: Loot; readonly index: number; readonly reduced: boolean; readonly collecting: boolean }) {
  const pop = useSharedValue(0);
  const fly = useSharedValue(0);
  const [counting, setCounting] = useState(reduced);
  const delay = 950 + index * 170;
  useEffect(() => {
    if (reduced) { pop.value = 1; setCounting(true); return; }
    pop.value = 0;
    setCounting(false);
    pop.value = withDelay(delay, withSequence(withSpring(1.15, { damping: 8, stiffness: 360 }), withSpring(1, { damping: 12, stiffness: 240 })));
    const id = setTimeout(() => { setCounting(true); haptic('tickSelection'); playSfx('coin', 0.5); }, delay);
    return () => { clearTimeout(id); cancelAnimation(pop); };
  }, [reduced]);
  useEffect(() => {
    if (!collecting || reduced) return;
    // Collect: every chip flies up toward the header counters.
    fly.value = withDelay(index * 60, withTiming(1, { duration: 480, easing: Easing.in(Easing.cubic) }));
  }, [collecting, reduced]);
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value * 2) * (1 - fly.value * 0.9),
    transform: [{ translateY: -420 * fly.value }, { translateX: (index % 2 ? 1 : -1) * 40 * fly.value },
      { scale: pop.value * (1 - 0.5 * fly.value) }],
  }));
  // Motion on the outer view only; the card's own fill stays on a plain view so a
  // count-up re-render never drops it.
  return <Animated.View style={style} accessibilityLabel={`${item.amount} ${item.label}${item.detail ? ` for ${item.detail}` : ''}`}>
    <View style={styles.loot}>
      <GameIcon name={item.icon} size={30} />
      <View>
        <CountUp to={item.amount} start={counting} reduced={reduced} />
        <Text style={styles.lootLabel} numberOfLines={1}>{item.label}</Text>
        {item.detail ? <Text style={styles.lootDetail} numberOfLines={1}>{item.detail}</Text> : null}
      </View>
    </View>
  </Animated.View>;
}

/**
 * The raid result. Defeated: the HP bar drains to zero, the boss takes a KO
 * wobble and tips over, confetti, "BOSS DEFEATED!" pops, the MVP crown lands,
 * loot chips count up one by one, and COLLECT flies them up to the header.
 * Escaped: the boss swims off and fighters get their thank-you.
 */
export default function BossWinCard({ raid, lastHp, onDone }: {
  readonly raid: BossRaid;
  /** HP the player last saw, so the drain starts where their eyes are. */
  readonly lastHp?: number;
  readonly onDone: () => void;
}) {
  const reduced = useReducedGameMotion();
  const reward = raid.you.reward!;
  const won = reward.outcome === 'defeated';
  const loot = lootFor(raid);
  const particles = useRef<ParticleHandle>(null);
  // Start where the player's eyes were; the motion preference is only known after mount.
  const [hp, setHp] = useState(!won ? raid.hp_left : Math.max(raid.hp_left, lastHp ?? Math.round(raid.hp_max * 0.12)));
  const [collecting, setCollecting] = useState(false);
  const ko = useSharedValue(0);
  const wobble = useSharedValue(0);
  const title = useSharedValue(0);
  const crown = useSharedValue(0);

  useEffect(() => {
    if (reduced) { ko.value = 1; title.value = 1; crown.value = 1; wobble.value = 0; setHp(raid.hp_left); return; }
    ko.value = 0; title.value = 0; crown.value = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Beat 1 (0ms): the last of the HP drains.
    timers.push(setTimeout(() => setHp(raid.hp_left), 80));
    if (won) {
      // Beat 2 (420ms): KO. Wobble, tip over, screen-shake-sized haptic, confetti and the win sting together.
      wobble.value = withDelay(420, withSequence(withTiming(1, { duration: 70 }), withTiming(-1, { duration: 90 }),
        withTiming(0.6, { duration: 90 }), withTiming(-0.3, { duration: 90 }), withTiming(0, { duration: 90 })));
      ko.value = withDelay(820, withSpring(1, { damping: 10, stiffness: 140 }));
      timers.push(setTimeout(() => {
        haptic('comboHeavy');
        playSfx('win', 0.9);
        particles.current?.burst({ x: CARD_W / 2, y: 150, preset: 'confetti', count: 70,
          colors: [BRAND.gold, BRAND.white, BRAND.skyDeep, BRAND.goldLight] });
      }, 460));
    } else {
      ko.value = withDelay(300, withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.cubic) }));
      timers.push(setTimeout(() => playSfx('whoosh', 0.6), 300));
    }
    title.value = withDelay(won ? 520 : 200, withSequence(withTiming(0, { duration: 0 }),
      withSpring(1.12, { damping: 7, stiffness: 300 }), withSpring(1, { damping: 12, stiffness: 220 })));
    if (raid.mvp_is_you) {
      crown.value = withDelay(820, withSequence(withSpring(1.3, { damping: 6, stiffness: 260 }), withSpring(1, { damping: 10, stiffness: 200 })));
      timers.push(setTimeout(() => haptic('success'), 820));
    }
    return () => { timers.forEach(clearTimeout); [ko, wobble, title, crown].forEach(v => cancelAnimation(v)); };
  }, [raid.id, reduced]);

  const bossStyle = useAnimatedStyle(() => won ? {
    opacity: 1 - 0.15 * ko.value,
    transform: [{ rotate: `${wobble.value * 12 - 18 * ko.value}deg` }, { translateY: 14 * ko.value }, { scale: 1 - 0.08 * ko.value }],
  } : {
    opacity: 1 - ko.value,
    transform: [{ translateX: 190 * ko.value }, { translateY: -20 * Math.sin(ko.value * Math.PI) }, { scale: 1 - 0.4 * ko.value }],
  });
  const titleStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, title.value * 1.5), transform: [{ scale: 0.6 + 0.4 * title.value }] }));
  const crownStyle = useAnimatedStyle(() => ({ opacity: Math.min(1, crown.value * 2), transform: [{ translateY: -30 * (1 - crown.value) }, { scale: crown.value }] }));

  const collect = () => {
    if (collecting) return;
    if (reduced || !loot.length) { onDone(); return; }
    setCollecting(true);
    haptic('success');
    playSfx('whoosh', 0.6);
    setTimeout(onDone, 560);
  };

  return (
    <View style={styles.card}>
      <View style={styles.ribbon}><Text style={styles.ribbonText}>{won ? 'BOSS RAID WON' : 'BOSS RAID OVER'}</Text></View>
      <View style={styles.hpWrap}><BossHpBar hpLeft={hp} hpMax={raid.hp_max} height={14} /></View>
      <View style={styles.stage}>
        <Animated.View style={bossStyle}>
          <Image source={BOSS_ART[raid.boss]} style={styles.art} contentFit="contain" />
        </Animated.View>
        {won && <View style={styles.koStars} pointerEvents="none">
          <GameIcon name="star" size={26} style={{ transform: [{ rotate: '-20deg' }] }} />
          <GameIcon name="sparkle" size={22} />
          <GameIcon name="star" size={20} style={{ transform: [{ rotate: '18deg' }] }} />
        </View>}
      </View>
      <Animated.Text style={[styles.kicker, titleStyle]}>{won ? 'BOSS DEFEATED!' : 'IT GOT AWAY'}</Animated.Text>
      <Text style={styles.title}>
        {won ? `The park beat ${BOSS_NAMES[raid.boss]}!` : `${BOSS_NAMES[raid.boss]} escaped. Thanks for fighting!`}
      </Text>
      {raid.mvp_is_you && <Animated.View style={[styles.mvp, crownStyle]}>
        <GameIcon name="crown" size={34} />
        <Text style={styles.mvpText}>YOU WERE MVP</Text>
      </Animated.View>}
      <View style={styles.lootGrid}>
        {loot.map((item, i) => <LootChip key={item.key} item={item} index={i} reduced={reduced} collecting={collecting} />)}
      </View>
      {reward.remote && <Text style={styles.fine}>You fought from home: loot at {Math.round((raid.remote.reward_rate ?? 0.6) * 100)}%, and Ride Parts come from being at the ride.</Text>}
      <GameButton label={loot.length ? 'Collect' : 'Back to the park'} onPress={collect} style={{ marginTop: 12 }} />
      {!reduced && <ParticleField ref={particles} width={CARD_W} height={CARD_H} style={styles.particles} />}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: CARD_W + 20, alignSelf: 'center', backgroundColor: BRAND.blue, borderRadius: 26, borderWidth: 4,
    borderColor: BRAND.white, paddingHorizontal: 18, paddingTop: 30, paddingBottom: 18, alignItems: 'center' },
  ribbon: { position: 'absolute', top: -18, alignSelf: 'center', backgroundColor: BRAND.gold, borderRadius: 14, borderWidth: 3,
    borderColor: BRAND.white, borderBottomWidth: 5, borderBottomColor: BRAND.goldLip, paddingHorizontal: 16, paddingVertical: 4 },
  ribbonText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
  hpWrap: { width: '82%' },
  stage: { height: 160, width: '100%', alignItems: 'center', justifyContent: 'center' },
  art: { width: 150, height: 150 },
  koStars: { position: 'absolute', top: 6, right: 70, flexDirection: 'row', gap: 2 },
  kicker: { fontFamily: 'Shark', fontSize: 32, color: BRAND.gold, textAlign: 'center', textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  title: { fontFamily: 'Knockout', fontSize: 18, color: BRAND.white, textAlign: 'center', marginTop: 2 },
  mvp: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.cream, borderRadius: 16,
    borderWidth: 2, borderColor: BRAND.gold, paddingHorizontal: 12, paddingVertical: 4 },
  mvpText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  lootGrid: { marginTop: 12, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  loot: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.cream, borderRadius: 14, borderWidth: 2,
    borderColor: BRAND.white, paddingHorizontal: 10, paddingVertical: 6, minWidth: 130 },
  lootAmount: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  lootLabel: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.navySoft, maxWidth: 110 },
  lootDetail: { fontFamily: 'Knockout', fontSize: 10, color: BRAND.navySoft, opacity: 0.8, maxWidth: 110 },
  fine: { marginTop: 8, fontFamily: 'Knockout', fontSize: 13, color: '#dff4ff', textAlign: 'center' },
  particles: { position: 'absolute', left: 0, top: 0 },
});
