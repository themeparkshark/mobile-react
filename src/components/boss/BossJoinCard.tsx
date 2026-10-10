/**
 * The "join the boss fight" card (Dustin, Oct 8: "no idea what it means to
 * join a battle from home"; "it wants 10 energy but I can't see my energy").
 *
 * Read in three seconds, almost no words:
 *   your Energy and Tickets (always on screen), minutes left
 *   the boss, where it is, the team HP bar
 *   three picture tiles: TEAM FIGHT / 60% FROM HOME (or 100% AT THE RIDE) / YOU WIN + loot
 * and, pinned to the bottom of the sheet (BossJoinCta), one big button with
 * the cost on it and your Energy after.
 */
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { BOSS_NAMES, type BossRaid } from '../../api/endpoints/parks/raid';
import { haptic } from '../../gamekit/Haptics';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { BRAND, GameIcon } from '../../ui';
import { BOSS_ART } from './bossArt';
import { usePowerBudget } from '../../power';
import { BossHpBar } from './BossSheetParts';
import { joinCost, joinLabel, minutesLeft, type RewardPreview } from './joinModel';

export function Wallet({ energy, tickets, showTickets, short }: {
  energy: number; tickets: number; showTickets: boolean; short: 'energy' | 'ticket' | null;
}) {
  return <View style={styles.wallet} accessible accessibilityLabel={`You have ${energy} Energy${showTickets ? ` and ${tickets} Tickets` : ''}`}>
    <View style={[styles.walletItem, short === 'energy' && styles.walletShort]}><GameIcon name="energy" size={22} />
      <Text style={styles.walletNum} maxFontSizeMultiplier={1.3}>{energy.toLocaleString()}</Text>
      {short === 'energy' && <View style={styles.bang}><Text style={styles.bangText}>!</Text></View>}</View>
    {showTickets && <View style={[styles.walletItem, short === 'ticket' && styles.walletShort]}><GameIcon name="ticket" size={22} />
      <Text style={styles.walletNum} maxFontSizeMultiplier={1.3}>{tickets.toLocaleString()}</Text>
      {short === 'ticket' && <View style={styles.bang}><Text style={styles.bangText}>!</Text></View>}</View>}
  </View>;
}

export default function BossJoinCard({ raid, remote, walkCloser, energy, tickets, endsAt, now, rewards, onClose, note, paused = false }: {
  raid: BossRaid; remote: boolean; walkCloser: boolean; energy: number; tickets: number; endsAt: string; now: number;
  rewards: RewardPreview; onClose: () => void; note: string | null;
  /** The fight is up on top: stop the idle loops underneath. */
  paused?: boolean;
}) {
  const reduced = useReducedGameMotion();
  const { ambient } = usePowerBudget();
  const cost = joinCost(raid, remote, energy, tickets);
  const name = BOSS_NAMES[raid.boss];
  const repeat = raid.you.attacks > 0;
  const mins = minutesLeft(endsAt, now);
  const bob = useSharedValue(0);
  const enter = useSharedValue(reduced ? 1 : 0);
  const greeted = useRef(false);
  useEffect(() => {
    if (!reduced && !paused && ambient) bob.value = withRepeat(withTiming(1, { duration: 1300, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(bob);
  }, [reduced, bob, paused, ambient]);
  useEffect(() => {
    // The boss arrives with a short sting and one tick (sound follows the player's settings; motion respects Reduce Motion).
    if (greeted.current) return;
    greeted.current = true;
    enter.value = reduced ? 1 : withSpring(1, { damping: 8, stiffness: 180 });
    GameAudio.play(GameAudio.hasCue('bo_enter_kraken') ? 'bo_enter_kraken' : 'fx.whoosh', { volume: 0.7 });
    haptic('tickSelection');
  }, [reduced, enter]);
  const bobStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -bob.value * 6 }, { rotate: `${(bob.value - 0.5) * 4}deg` },
    { scale: 0.6 + enter.value * 0.4 }] }));
  const pctLeft = Math.round((raid.hp_left / Math.max(1, raid.hp_max)) * 100);

  return (
    <View>
      <View style={styles.topRow}>
        <View style={styles.live} accessible accessibilityLabel={`Live now, ${mins} minutes left`}>
          <View style={styles.liveDot} />
          <GameIcon name="timer" size={18} />
          <Text style={styles.liveText} maxFontSizeMultiplier={1.3}>{mins} min left</Text>
        </View>
        <Wallet energy={energy} tickets={tickets} showTickets={remote} short={cost.short?.kind ?? null} />
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} style={styles.close} hitSlop={8}>
          <GameIcon name="close" size={26} />
        </Pressable>
      </View>

      <View style={styles.hero}>
        <Animated.View style={[styles.bossDisc, bobStyle]}>
          <Image source={BOSS_ART[raid.boss]} style={styles.bossArt} contentFit="contain" />
        </Animated.View>
        <View style={{ flex: 1 }}>
          <Text style={styles.headline} accessibilityRole="header" maxFontSizeMultiplier={1.25}>{name} attacks!</Text>
          <Text style={styles.where} numberOfLines={2} maxFontSizeMultiplier={1.3}>at {raid.ride_name ?? 'the park'}</Text>
        </View>
      </View>

      <Pulse value={raid.hp_left} reduced={reduced} style={{ marginTop: 10 }}><BossHpBar hpLeft={raid.hp_left} hpMax={raid.hp_max} height={22} /></Pulse>
      <View style={styles.hpRow}>
        <View />
        <Pulse value={raid.fighters} reduced={reduced} style={styles.fighters}><GameIcon name="shark" size={18} />
          <Text style={styles.hpText} maxFontSizeMultiplier={1.3}>{raid.fighters} fighting</Text></Pulse>
      </View>

      <View style={styles.tiles}>
        {!repeat && <Tile label="TEAM FIGHT" a11y="Everyone fights it together before time runs out">
          <GameIcon name="swords" size={34} />
          <View style={styles.teamDots}>{[0, 1, 2].map(i => <View key={i} style={[styles.teamDot, { marginLeft: i ? -6 : 0 }]}>
            <GameIcon name="shark" size={14} /></View>)}</View>
        </Tile>}
        {remote
          ? <Tile label="FROM HOME" tone="home" a11y={`From home your hits count ${Math.round(raid.remote.damage_rate * 100)} percent, loot is ${Math.round((raid.remote.reward_rate ?? raid.remote.damage_rate) * 100)} percent and you cannot be MVP`}>
            <Text style={styles.homeWhy} maxFontSizeMultiplier={1.2}>Not at the park</Text>
            <Text style={styles.bigPct} maxFontSizeMultiplier={1}>{Math.round(raid.remote.damage_rate * 100)}%</Text>
            <View style={styles.mvp}>
              <View><GameIcon name="crown" size={28} /><View style={styles.crossOut} /></View>
              <Text style={styles.tileSmall} maxFontSizeMultiplier={1.2}>no MVP</Text>
            </View>
          </Tile>
          : <Tile label="AT THE RIDE" tone="park" a11y="At the ride you hit at full power and can be MVP">
            <Text style={styles.bigPct} maxFontSizeMultiplier={1}>100%</Text>
            <View style={styles.mvp}><GameIcon name="crown" size={14} /><Text style={styles.tileSmall} maxFontSizeMultiplier={1.2}>MVP</Text></View>
          </Tile>}
        <Tile label="TEAM WINS" wide={repeat} a11y={`If the team wins you get ${rewards.coins} coins, ${rewards.xp} XP, ${rewards.energy} Energy${rewards.parts ? ` and ${rewards.parts} Ride Parts` : ''}`}>
          {/* With Ride Parts the chest picture makes room for the fourth loot line (fits 375 pt). */}
          {!(rewards.parts > 0 && !repeat) && <GameIcon name="chest" size={30} />}
          <View style={styles.lootGrid}>
            <Loot icon="coins" n={rewards.coins} /><Loot icon="xp" n={rewards.xp} /><Loot icon="energy" n={rewards.energy} />
            {rewards.parts > 0 && <Loot icon="parts" n={rewards.parts} />}
          </View>
        </Tile>
      </View>

      {walkCloser && <View style={styles.hint}>
        <GameIcon name="pin" size={20} />
        <Text style={styles.hintText}>Walk closer to {raid.ride_name ?? 'the ride'} for 100%.</Text>
      </View>}
      {note && <Text style={styles.note}>{note}</Text>}
    </View>
  );
}

/** The one button, with the cost on it and your Energy after. Pinned to the bottom of the sheet. */
export function BossJoinCta({ raid, remote, energy, tickets, blocked, starting, onFight, onClose, paused = false }: {
  raid: BossRaid; remote: boolean; energy: number; tickets: number; blocked: string | null; starting: boolean;
  onFight: () => void; onClose: () => void; paused?: boolean;
}) {
  const reduced = useReducedGameMotion();
  const { ambient } = usePowerBudget();
  const cost = joinCost(raid, remote, energy, tickets);
  const short = cost.short;
  const label = short && !starting ? `NEED ${short.need - short.have} ${short.kind === 'energy' ? 'ENERGY' : short.need - short.have === 1 ? 'TICKET' : 'TICKETS'}`
    : joinLabel(raid, remote);
  const off = !!blocked || starting;
  const [how, setHow] = useState(false);
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!reduced && !off && !paused && ambient) pulse.value = withRepeat(withSequence(withTiming(1.03, { duration: 520 }), withTiming(1, { duration: 520 })), -1, false);
    else { cancelAnimation(pulse); pulse.value = 1; }
    return () => cancelAnimation(pulse);
  }, [reduced, off, pulse, paused, ambient]);
  const pulseStyle = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));
  return (
    <View>
      <Animated.View style={pulseStyle}>
        <Pressable testID="boss-fight" accessibilityRole="button" disabled={off} onPress={onFight}
          accessibilityState={{ disabled: off, busy: starting }}
          accessibilityLabel={`${label}. Costs ${cost.ticket ? `${cost.ticket} Ticket and ` : ''}${cost.energy} Energy. You have ${energy} Energy${cost.ticket ? ` and ${tickets} Tickets` : ''}.`}
          style={({ pressed }) => [styles.cta, off && styles.ctaOff, pressed && { transform: [{ scale: 0.97 }] }]}>
          <Text style={[styles.ctaText, off && styles.ctaTextOff]} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>
            {starting ? 'GETTING READY...' : label}</Text>
          {short && !starting && <GameIcon name="lock" size={24} />}
          <View style={styles.costPill}>
            {cost.ticket > 0 && <><GameIcon name="ticket" size={22} /><Text style={styles.costNum}>{cost.ticket}</Text><Text style={styles.plus}>+</Text></>}
            <GameIcon name="energy" size={22} /><Text style={styles.costNum}>{cost.energy}</Text>
          </View>
        </Pressable>
      </Animated.View>
      {short ? <>
        <Pressable accessibilityRole="button" onPress={() => setHow(v => !v)} style={styles.howBtn} hitSlop={6}
          accessibilityLabel={`How to get ${short.kind === 'energy' ? 'Energy' : 'Tickets'}`}>
          <GameIcon name={short.kind === 'energy' ? 'energy' : 'ticket'} size={20} />
          <Text style={styles.howText} maxFontSizeMultiplier={1.3}>How to get {short.kind === 'energy' ? 'Energy' : 'Tickets'}</Text>
        </Pressable>
        {how && <View style={styles.howPanel}>
          <HowRow icon="map" text="Home finds on your map" />
          <HowRow icon="gift" text="Your daily chest" />
          {short.kind === 'energy' && <HowRow icon="ride" text="Rides at the park" />}
        </View>}
      </>
      : blocked ? <Text style={styles.blocked} maxFontSizeMultiplier={1.3}>{blocked}</Text>
        : <View style={styles.afterRow} accessible accessibilityLabel={`After this attack you will have ${cost.energyAfter} Energy. Attack ${raid.you.attacks + 1} of ${raid.max_attacks ?? 5}.`}>
          <Text style={styles.after} maxFontSizeMultiplier={1.3}>After</Text>
          <GameIcon name="energy" size={18} /><Text style={styles.afterNum} maxFontSizeMultiplier={1.3}>{cost.energyAfter}</Text>
          {cost.ticket > 0 && <><GameIcon name="ticket" size={18} /><Text style={styles.afterNum} maxFontSizeMultiplier={1.3}>{cost.ticketsAfter}</Text></>}
          {remote && raid.remote.joined && <><GameIcon name="ticket" size={18} /><Text style={styles.after} maxFontSizeMultiplier={1.3}>paid</Text></>}
          {raid.you.attacks > 0 && <Text style={styles.after} maxFontSizeMultiplier={1.3}>  ·  Attack {raid.you.attacks + 1} of {raid.max_attacks ?? 5}</Text>}
        </View>}
      <Pressable accessibilityRole="button" onPress={onClose} style={styles.notNow} hitSlop={6}>
        <Text style={styles.notNowText} maxFontSizeMultiplier={1.3}>Not now</Text></Pressable>
    </View>
  );
}

function HowRow({ icon, text }: { icon: 'map' | 'gift' | 'ride'; text: string }) {
  return <View style={styles.howRow}><GameIcon name={icon} size={24} /><Text style={styles.howRowText} maxFontSizeMultiplier={1.3}>{text}</Text></View>;
}

function Tile({ label, children, tone, wide, a11y }: { label: string; children: React.ReactNode; tone?: 'home' | 'park'; wide?: boolean; a11y: string }) {
  return <View style={[styles.tile, tone === 'home' && styles.tileHome, tone === 'park' && styles.tilePark, wide && { flex: 2 }]}
    accessible accessibilityLabel={a11y}>
    <View style={styles.tilePic}>{children}</View>
    <Text style={styles.tileLabel} numberOfLines={1} adjustsFontSizeToFit maxFontSizeMultiplier={1.2}>{label}</Text>
  </View>;
}
/** A live value (HP, fighters) gives a small bump when it changes while the card is open. */
function Pulse({ value, reduced, style, children }: { value: number; reduced: boolean; style?: object; children: React.ReactNode }) {
  const v = useSharedValue(0);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (!reduced) v.value = withSequence(withTiming(1, { duration: 120 }), withSpring(0, { damping: 8, stiffness: 260 }));
  }, [value, reduced, v]);
  const a = useAnimatedStyle(() => ({ transform: [{ scale: 1 + v.value * 0.08 }] }));
  return <Animated.View style={[style, a]}>{children}</Animated.View>;
}
function Loot({ icon, n }: { icon: 'coins' | 'xp' | 'energy' | 'parts'; n: number }) {
  return <View style={styles.loot}><GameIcon name={icon} size={18} />
    <Text style={styles.lootNum} maxFontSizeMultiplier={1.2}>{n}{icon === 'xp' ? ' XP' : icon === 'parts' ? ' Parts' : ''}</Text></View>;
}

const styles = StyleSheet.create({
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  live: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: BRAND.redLip, borderRadius: 14, borderWidth: 2, borderColor: BRAND.white,
    paddingHorizontal: 9, paddingVertical: 3 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: BRAND.white },
  liveText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white },
  wallet: { flex: 1, flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  walletItem: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: BRAND.cream, borderRadius: 14, borderWidth: 2,
    borderColor: BRAND.navy, paddingLeft: 4, paddingRight: 9, paddingVertical: 2 },
  walletShort: { borderColor: BRAND.red, borderWidth: 3, backgroundColor: '#ffe3df' },
  bang: { position: 'absolute', right: -7, top: -9, width: 20, height: 20, borderRadius: 10, backgroundColor: BRAND.red, borderWidth: 2,
    borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  bangText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white, lineHeight: 16 },
  walletNum: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: BRAND.white,
    borderWidth: 3, borderColor: BRAND.navy },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
  bossDisc: { width: 104, height: 104, borderRadius: 52, backgroundColor: BRAND.sky, borderWidth: 3, borderColor: BRAND.white,
    alignItems: 'center', justifyContent: 'center' },
  bossArt: { width: 92, height: 92 },
  headline: { fontFamily: 'Shark', fontSize: 31, lineHeight: 35, color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2.5 }, textShadowRadius: 0 },
  where: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, marginTop: 2 },
  hpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, paddingHorizontal: 2 },
  fighters: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hpText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  tiles: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tile: { flex: 1, alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: 18, borderWidth: 3, borderColor: BRAND.navy, paddingTop: 6, paddingBottom: 6,
    paddingHorizontal: 4 },
  tileHome: { backgroundColor: '#e3f4ff' },
  tilePark: { backgroundColor: '#fff3c4' },
  tilePic: { height: 58, alignItems: 'center', justifyContent: 'center' },
  tileLabel: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy, marginTop: 2 },
  tileSmall: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navySoft },
  homeWhy: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy },
  bigPct: { fontFamily: 'Shark', fontSize: 30, lineHeight: 34, color: BRAND.navy },
  mvp: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  crossOut: { position: 'absolute', left: -3, top: 11, width: 34, height: 5, borderRadius: 2, backgroundColor: BRAND.red, transform: [{ rotate: '-35deg' }] },
  teamDots: { flexDirection: 'row', marginTop: 2 },
  teamDot: { width: 20, height: 20, borderRadius: 10, backgroundColor: BRAND.sky, borderWidth: 2, borderColor: BRAND.navy, alignItems: 'center', justifyContent: 'center' },
  lootGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: 4 },
  loot: { flexDirection: 'row', alignItems: 'center', gap: 1 },
  lootNum: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy },
  hint: { marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.cream, borderRadius: 12, borderWidth: 2,
    borderColor: BRAND.gold, padding: 8 },
  hintText: { flex: 1, fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
  note: { marginTop: 8, fontFamily: 'Shark', fontSize: 15, color: BRAND.white, textAlign: 'center', backgroundColor: 'rgba(5,52,110,0.55)',
    borderRadius: 12, padding: 6 },
  cta: { minHeight: 70, borderRadius: 22, backgroundColor: BRAND.red, borderWidth: 3, borderColor: BRAND.white, borderBottomWidth: 7,
    borderBottomColor: BRAND.redLip, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 14 },
  // Disabled: a calm sky button with navy text (never a see-through red over blue).
  ctaOff: { backgroundColor: BRAND.sky, borderBottomColor: BRAND.skyDeep },
  ctaText: { flexShrink: 1, fontFamily: 'Shark', fontSize: 25, color: BRAND.white, letterSpacing: 0.5, textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 1, height: 1.5 }, textShadowRadius: 0 },
  ctaTextOff: { color: BRAND.navy, textShadowColor: 'transparent' },
  costPill: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: BRAND.cream, borderRadius: 16, borderWidth: 2,
    borderColor: BRAND.navy, paddingHorizontal: 8, paddingVertical: 3 },
  costNum: { fontFamily: 'Shark', fontSize: 19, color: BRAND.navy },
  plus: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navySoft, marginHorizontal: 3 },
  blocked: { marginTop: 8, fontFamily: 'Shark', fontSize: 16, color: BRAND.white, textAlign: 'center' },
  afterRow: { marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 3 },
  after: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white },
  afterNum: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, backgroundColor: BRAND.cream, borderRadius: 8, paddingHorizontal: 5,
    overflow: 'hidden', marginRight: 4 },
  howBtn: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: BRAND.cream, borderRadius: 16,
    borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 12, paddingVertical: 6, minHeight: 44 },
  howText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
  howPanel: { marginTop: 8, backgroundColor: BRAND.cream, borderRadius: 16, borderWidth: 2, borderColor: BRAND.navy, padding: 8, gap: 4 },
  howRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  howRowText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy },
  notNow: { alignSelf: 'center', marginTop: 2, minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center' },
  notNowText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.white, textDecorationLine: 'underline' },
});
