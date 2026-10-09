/**
 * The "join the boss fight" card (Dustin, Oct 8: "no idea what it means to
 * join a battle from home"; "it wants 10 energy but I can't see my energy").
 *
 * Read top to bottom in three seconds:
 *   wallet (your Energy and Tickets, always on screen)
 *   the boss, where it is, the team HP bar and the clock
 *   three picture rows: team fight / home or ride power / what you win
 *   one big button with the cost on it, and "you will have N left"
 */
import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { BOSS_NAMES, type BossRaid } from '../../api/endpoints/parks/raid';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../ui';
import { BOSS_ART } from './bossArt';
import { BossHpBar } from './BossSheetParts';
import { joinCost, type JoinCost, type RewardPreview } from './joinModel';

export function Wallet({ energy, tickets, showTickets }: { energy: number; tickets: number; showTickets: boolean }) {
  return <View style={styles.wallet} accessible accessibilityLabel={`You have ${energy} Energy${showTickets ? ` and ${tickets} Tickets` : ''}`}>
    <View style={styles.walletItem}><GameIcon name="energy" size={22} /><Text style={styles.walletNum}>{energy.toLocaleString()}</Text></View>
    {showTickets && <View style={styles.walletItem}><GameIcon name="ticket" size={22} /><Text style={styles.walletNum}>{tickets.toLocaleString()}</Text></View>}
  </View>;
}

export default function BossJoinCard({ raid, remote, walkCloser, energy, tickets, clockText, rewards, blocked, starting, onFight, onClose, note }: {
  raid: BossRaid; remote: boolean; walkCloser: boolean; energy: number; tickets: number; clockText: string;
  rewards: RewardPreview; blocked: string | null; starting: boolean; onFight: () => void; onClose: () => void; note: string | null;
}) {
  const reduced = useReducedGameMotion();
  const cost: JoinCost = joinCost(raid, remote, energy, tickets);
  const name = BOSS_NAMES[raid.boss];
  const repeat = raid.you.attacks > 0;
  const bob = useSharedValue(0);
  useEffect(() => {
    if (!reduced) bob.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(bob);
  }, [reduced, bob]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 6 }, { rotate: `${(bob.value - 0.5) * 4}deg` }] }));
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!reduced && !blocked) pulse.value = withRepeat(withSequence(withTiming(1.03, { duration: 520 }), withTiming(1, { duration: 520 })), -1, false);
    else { cancelAnimation(pulse); pulse.value = 1; }
    return () => cancelAnimation(pulse);
  }, [reduced, blocked, pulse]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  const pctLeft = Math.round((raid.hp_left / Math.max(1, raid.hp_max)) * 100);
  const label = repeat ? 'ATTACK AGAIN' : remote ? 'JOIN FROM HOME' : 'FIGHT!';

  return (
    <View>
      <View style={styles.topRow}>
        <View style={styles.live}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE  {clockText}</Text></View>
        <Wallet energy={energy} tickets={tickets} showTickets={cost.ticket > 0 || remote} />
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close} hitSlop={8}>
          <GameIcon name="close" size={34} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Animated.View style={[styles.bossDisc, bobStyle]}>
          <Image source={BOSS_ART[raid.boss]} style={styles.bossArt} contentFit="contain" />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headline} accessibilityRole="header">{name} attack!</Text>
          <Text style={styles.where} numberOfLines={2}>at {raid.ride_name ?? 'the park'}</Text>
          <View style={styles.fighters}><GameIcon name="shark" size={18} /><Text style={styles.fightersText}>
            {raid.fighters} {raid.fighters === 1 ? 'shark' : 'sharks'} fighting</Text></View>
        </View>
      </View>

      <View style={{ marginTop: 10 }}><BossHpBar hpLeft={raid.hp_left} hpMax={raid.hp_max} height={20} /></View>
      <Text style={styles.hpText}>{pctLeft}% left  ·  {raid.hp_left.toLocaleString()} HP</Text>

      {!repeat ? <View style={styles.rows}>
        <Row icon="swords" title="Team up and beat it" sub={`Before the clock hits 0:00`} />
        {remote
          ? <Row icon="map" title="You're not at the park" sub={`Fight from home at ${Math.round(raid.remote.damage_rate * 100)}% power`} tone="home" />
          : <Row icon="pin" title="You're at the ride!" sub="Full power. Top hitter is MVP" tone="park" />}
        <Row icon="chest" title="Team wins, you get" loot={rewards} />
      </View> : <View style={[styles.rows, styles.rowsRepeat]}>
        <Row icon="chest" title="Team wins, you get" loot={rewards} />
      </View>}

      {walkCloser && <View style={styles.hint}>
        <GameIcon name="pin" size={20} />
        <Text style={styles.hintText}>Walk closer to {raid.ride_name ?? 'the ride'} for full power.</Text>
      </View>}
      {note && <Text style={styles.note}>{note}</Text>}

      <Animated.View style={[styles.ctaWrap, pulseStyle]}>
        <Pressable testID="boss-fight" accessibilityRole="button" disabled={!!blocked || starting} onPress={onFight}
          accessibilityLabel={`${label}. Costs ${cost.ticket ? `${cost.ticket} Ticket and ` : ''}${cost.energy} Energy. You have ${energy} Energy${cost.ticket ? ` and ${tickets} Tickets` : ''}.`}
          style={({ pressed }) => [styles.cta, (!!blocked || starting) && styles.ctaOff, pressed && { transform: [{ scale: 0.97 }] }]}>
          <Text style={styles.ctaText} numberOfLines={1} adjustsFontSizeToFit>{starting ? 'GETTING READY...' : label}</Text>
          <View style={styles.costPill}>
            {cost.ticket > 0 && <><GameIcon name="ticket" size={22} /><Text style={styles.costNum}>{cost.ticket}</Text><Text style={styles.plus}>+</Text></>}
            <GameIcon name="energy" size={22} /><Text style={styles.costNum}>{cost.energy}</Text>
          </View>
        </Pressable>
      </Animated.View>
      {blocked ? <Text style={styles.blocked}>{blocked}</Text>
        : <Text style={styles.after}>
          After: <GameIcon name="energy" size={16} /> <Text style={styles.afterNum}>{cost.energyAfter}</Text>
          {cost.ticket > 0 ? <>  ·  <GameIcon name="ticket" size={16} /> <Text style={styles.afterNum}>{cost.ticketsAfter}</Text>  (Ticket covers this whole fight)</> : null}
          {'  ·  '}Attack {raid.you.attacks + 1} of {raid.max_attacks ?? 5}
        </Text>}
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.notNow} hitSlop={6}><Text style={styles.notNowText}>Not now</Text></Pressable>
    </View>
  );
}

function Row({ icon, title, sub, loot, tone }: {
  icon: 'swords' | 'map' | 'pin' | 'chest'; title: string; sub?: string; loot?: RewardPreview; tone?: 'home' | 'park';
}) {
  return <View style={[styles.row, tone === 'home' && styles.rowHome, tone === 'park' && styles.rowPark]}>
    <View style={styles.rowIcon}><GameIcon name={icon} size={30} /></View>
    <View style={{ flex: 1 }}>
      <Text style={styles.rowTitle}>{title}</Text>
      {sub && <Text style={styles.rowSub}>{sub}</Text>}
      {loot && <View style={styles.lootRow}>
        <Loot icon="coins" n={loot.coins} /><Loot icon="xp" n={loot.xp} /><Loot icon="energy" n={loot.energy} />
        {loot.parts > 0 && <Loot icon="parts" n={loot.parts} />}
      </View>}
    </View>
  </View>;
}
function Loot({ icon, n }: { icon: 'coins' | 'xp' | 'energy' | 'parts'; n: number }) {
  return <View style={styles.loot}><GameIcon name={icon} size={22} /><Text style={styles.lootNum}>{n}</Text></View>;
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.red, borderRadius: 12, borderWidth: 2, borderColor: BRAND.white,
    paddingHorizontal: 9, paddingVertical: 3 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: BRAND.white },
  liveText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white, letterSpacing: 0.5 },
  wallet: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  walletItem: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.cream, borderRadius: 14, borderWidth: 2,
    borderColor: BRAND.navy, paddingLeft: 4, paddingRight: 9, paddingVertical: 2 },
  walletNum: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  bossDisc: { width: 108, height: 108, borderRadius: 54, backgroundColor: BRAND.sky, borderWidth: 3, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center' },
  bossArt: { width: 96, height: 96 },
  headline: { fontFamily: 'Shark', fontSize: 30, lineHeight: 34, color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2.5 }, textShadowRadius: 0 },
  where: { fontFamily: 'Knockout', fontSize: 16, color: '#e4f7ff' },
  fighters: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 },
  fightersText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white },
  hpText: { marginTop: 3, fontFamily: 'Shark', fontSize: 14, color: BRAND.white, textAlign: 'center' },
  rows: { marginTop: 10, gap: 6 },
  rowsRepeat: { marginTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, paddingVertical: 6, paddingHorizontal: 10 },
  rowHome: { backgroundColor: 'rgba(191,229,255,0.28)' },
  rowPark: { backgroundColor: 'rgba(255,207,59,0.25)' },
  rowIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND.cream, borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white },
  rowSub: { fontFamily: 'Knockout', fontSize: 15, color: '#e4f7ff' },
  lootRow: { flexDirection: 'row', gap: 12, marginTop: 2 },
  loot: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lootNum: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white },
  hint: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.cream, borderRadius: 12, borderWidth: 2,
    borderColor: BRAND.gold, padding: 8 },
  hintText: { flex: 1, fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy },
  note: { marginTop: 8, fontFamily: 'Shark', fontSize: 15, color: BRAND.gold, textAlign: 'center', textShadowColor: BRAND.navy,
    textShadowOffset: { width: 0, height: 1.5 }, textShadowRadius: 0 },
  ctaWrap: { marginTop: 14 },
  cta: { minHeight: 68, borderRadius: 22, backgroundColor: BRAND.red, borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 7,
    borderBottomColor: BRAND.redLip, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 14 },
  ctaOff: { opacity: 0.5 },
  ctaText: { flexShrink: 1, fontFamily: 'Shark', fontSize: 25, color: BRAND.white, letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 1, height: 1.5 }, textShadowRadius: 0 },
  costPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: BRAND.cream, borderRadius: 16, borderWidth: 2,
    borderColor: BRAND.navy, paddingHorizontal: 8, paddingVertical: 3 },
  costNum: { fontFamily: 'Shark', fontSize: 19, color: BRAND.navy },
  plus: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navySoft, marginHorizontal: 3 },
  blocked: { marginTop: 8, fontFamily: 'Shark', fontSize: 16, color: BRAND.goldLight, textAlign: 'center' },
  after: { marginTop: 8, fontFamily: 'Knockout', fontSize: 15, color: '#e4f7ff', textAlign: 'center' },
  afterNum: { fontFamily: 'Shark', color: BRAND.white },
  notNow: { alignSelf: 'center', marginTop: 4, minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center' },
  notNowText: { fontFamily: 'Shark', fontSize: 16, color: '#e4f7ff', textDecorationLine: 'underline' },
});
