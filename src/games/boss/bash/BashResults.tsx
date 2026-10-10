/**
 * Boss Bash result: what you did to the boss, what the team still needs, what
 * you win if the team finishes it, and the next attack with its cost and your
 * Energy right on the button. Numbers are the server's formula (home rate in).
 */
import { Image } from 'expo-image';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { BossId } from '../../../api/endpoints/parks/raid';
import { BOSS_ART } from '../../../components/boss/bossArt';
import { CountUpText, haptic, type ShellResultsArgs } from '../../../gamekit';
import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { BRAND } from '../../../ui/tokens';
import GameIcon from '../../../ui/GameIcon';
import { BASH_ART } from './art';

const CHEST_OPEN = require('../../../../assets/images/daily/chest-open.png');

export interface BashNext {
  /** Attacks left before this round is sent. */
  readonly attacksLeft: number;
  /** Energy before this round is charged. */
  readonly energy: number;
  readonly energyCost: number;
}
export interface BashRewards { readonly coins: number; readonly xp: number; readonly energy: number; readonly parts: number }

function clock(endsAt: string | undefined, now: number) {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  return ms <= 0 ? null : `${Math.max(1, Math.ceil(ms / 60000))} min left`;
}

/** Next-attack state after this round's charge. Pure (tested). */
export function nextAttack(next: BashNext | undefined): { can: boolean; energyAfter: number; reason: string | null; attacksAfter: number } {
  if (!next) return { can: false, energyAfter: 0, reason: null, attacksAfter: 0 };
  const energyAfter = Math.max(0, next.energy - next.energyCost);
  const attacksAfter = Math.max(0, next.attacksLeft - 1);
  if (attacksAfter <= 0) return { can: false, energyAfter, attacksAfter, reason: 'That was your last attack on this boss.' };
  if (energyAfter < next.energyCost) {
    return { can: false, energyAfter, attacksAfter, reason: `Next attack needs ${next.energyCost} Energy. You will have ${energyAfter}.` };
  }
  return { can: true, energyAfter, attacksAfter, reason: null };
}

/** What the server will credit: your damage, but never past the per-player raid cap. Pure (tested). */
export function creditedDamage(damage: number, capLeft: number | undefined): number {
  return capLeft === undefined ? damage : Math.max(0, Math.min(damage, capLeft));
}

export default function BashResults({ args, bossName, boss, startHp, hpMax, damage: rawDamage, capLeft, rate, meta, fighters, endsAt, next, rewards, onAgain, warmNext, defeated, perfLine,
  receipt = null, receiptNote = null, bestBefore = 0, teamDamage = 0, portrait }: {
  args: ShellResultsArgs; bossName: string; boss: BossId; rideName: string | null; startHp: number; hpMax: number; damage: number;
  /** Per-player raid cap left before this round (config boss.max_damage_per_player_per_raid). */
  capLeft?: number;
  warmNext?: boolean;
  /** Capture builds only: the round's frame-time line. */
  perfLine?: string | null;
  /** The beaten-boss face for a team win. */
  defeated?: number;
  rate: number; meta: Record<string, unknown>; fighters: number; endsAt?: string; next?: BashNext; rewards?: BashRewards;
  onAgain?: () => void;
  /** The round was sent at the bell: what the server said. */
  receipt?: 'saving' | 'saved' | 'error' | null;
  receiptNote?: string | null;
  /** Your best on this boss as read at the start of the round. */
  bestBefore?: number;
  teamDamage?: number;
  /** The hurt boss (it took your hits). */
  portrait?: number;
}) {
  const { stars, claim, reducedMotion: reduced } = args;
  const damage = creditedDamage(rawDamage, capLeft);
  const capped = damage < rawDamage;
  // NEW BEST compares with the best read when the round started (stable across remounts).
  const best = bestBefore > 0 && damage > bestBefore;
  useEffect(() => {
    if (damage > bestBefore) void AsyncStorage.setItem(`boss_bash_best_${boss}`, String(damage)).catch(() => undefined);
  }, [boss, damage, bestBefore]);
  const hpAfter = Math.max(0, startHp - damage);
  const ko = startHp > 0 && hpAfter === 0;
  // The team took the boss down (your round or teammates' hits before the bell): a win, never "still fighting".
  const won = hpAfter === 0;
  const n = nextAttack(next);
  const noHits = damage <= 0;
  const drain = useSharedValue(0);
  const starsIn = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const pressed = useRef(false);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    drain.value = reduced ? 1 : withDelay(700, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    starsIn.forEach((s, i) => {
      if (i >= stars) return;
      const at = 450 + i * 260;
      s.value = reduced ? 1 : withDelay(at, withSequence(withTiming(1.4, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 260 })));
      const t = setTimeout(() => { GameAudio.play('fx.reveal', { pitch: i * 3, volume: 0.6 }); haptic('hitMedium'); }, reduced ? 0 : at);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pct = (v: number) => `${Math.min(100, (Math.max(0, v) / Math.max(1, hpMax)) * 100)}%` as `${number}%`;
  const fill = useAnimatedStyle(() => {
    const v = startHp - (startHp - hpAfter) * drain.value;
    return { width: `${Math.min(100, (Math.max(0, v) / Math.max(1, hpMax)) * 100)}%` as `${number}%` };
  });
  const s0 = useAnimatedStyle(() => ({ transform: [{ scale: starsIn[0].value }], opacity: starsIn[0].value > 0 ? 1 : 0 }));
  const s1 = useAnimatedStyle(() => ({ transform: [{ scale: starsIn[1].value }], opacity: starsIn[1].value > 0 ? 1 : 0 }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ scale: starsIn[2].value }], opacity: starsIn[2].value > 0 ? 1 : 0 }));
  const left = clock(endsAt, Date.now());
  const once = (f?: () => void) => () => { if (pressed.current || !f) return; pressed.current = true; f(); };

  return (
    <View style={styles.card} accessibilityViewIsModal>
      <View style={[styles.banner, won && styles.bannerWin]} accessibilityRole="header">
        <Text style={styles.bannerText}>{won ? (ko && !noHits ? 'YOU FINISHED IT!' : 'TEAM WON!') : noHits ? 'MISSED IT' : 'STILL FIGHTING'}</Text>
      </View>
      {best && !noHits && <View style={styles.best}><Text style={styles.bestText}>NEW BEST!</Text></View>}
      <View style={styles.head}>
        <View>
          <Image source={won ? (defeated ?? portrait ?? BOSS_ART[boss]) : (portrait ?? BOSS_ART[boss])} style={styles.bossPic} contentFit="contain" />
          {won && <View style={styles.stamp}><Text style={styles.stampText} maxFontSizeMultiplier={1}>BOSS{'\n'}DOWN</Text></View>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.kicker}>{noHits ? 'NO HITS THIS TIME' : `YOU HIT ${bossName.toUpperCase()} FOR`}</Text>
          {noHits ? <Text style={styles.zero}>No Energy was spent.</Text>
            : <CountUpText value={damage} delayMs={reduced ? 0 : 200} durationMs={reduced ? 1 : 700} style={styles.dmg} />}
          {rate < 1 && !noHits && <Text style={styles.rate}>From home, {Math.round(rate * 100)}% power</Text>}
          {!noHits && teamDamage > 0 && <Text style={styles.rate}>You {damage.toLocaleString()}  ·  Team {(teamDamage + damage).toLocaleString()}</Text>}
          {capped && <Text style={styles.rate}>That hits the most one shark can do to this boss.</Text>}
        </View>
      </View>

      {!noHits && <View style={styles.stars}>
        {[s0, s1, s2].map((st, i) => <View key={i} style={styles.starSlot}>
          <Image source={BASH_ART.star} style={[StyleSheet.absoluteFill, { opacity: 0.18 }]} contentFit="contain" tintColor={BRAND.navy} />
          <Animated.View style={[StyleSheet.absoluteFill, st]}><Image source={BASH_ART.star} style={StyleSheet.absoluteFill} contentFit="contain" /></Animated.View>
        </View>)}
      </View>}

      <View style={styles.raid}>
        {/* Won: the stamp and "Boss down!" say it; an empty pale bar read as broken. */}
        {!won && <View style={styles.hpTrack}>
          <View style={[styles.hpGold, { width: pct(startHp) }]} />
          <Animated.View style={[styles.hpRed, fill]} />
        </View>}
        <Text style={styles.raidLine} numberOfLines={1}>
          {ko ? 'Your hit could finish it!' : won ? 'Boss down!' : `${hpAfter.toLocaleString()} HP left`}{left && !won ? `  ·  ${left}` : ''}{fighters > 0 && !won ? `  ·  ${fighters} fighting` : ''}
        </Text>
      </View>

      {rewards && <View style={styles.loot} accessible accessibilityLabel={`If your team beats it you get ${rewards.coins} coins, ${rewards.xp} XP, ${rewards.energy} Energy${rewards.parts ? `, ${rewards.parts} Ride Parts` : ''}`}>
        {won && <ChestPop reduced={reduced} />}
        <Text style={styles.lootTitle}>{won ? 'Your loot is on the way' : 'Team wins, you get'}</Text>
        <View style={styles.lootRow}>
          <Loot icon="coins" n={rewards.coins} count={won} reduced={reduced} />
          <Loot icon="xp" n={rewards.xp} count={won} reduced={reduced} />
          <Loot icon="energy" n={rewards.energy} count={won} reduced={reduced} />
          {rewards.parts > 0 && <Loot icon="parts" n={rewards.parts} count={won} reduced={reduced} />}
        </View>
      </View>}

      {receipt && !noHits && <View style={[styles.receipt, receipt === 'error' && styles.receiptErr]} accessibilityLiveRegion="polite">
        <GameIcon name={receipt === 'saved' ? 'check' : receipt === 'error' ? 'info' : 'timer'} size={18} />
        <Text style={styles.receiptText} maxFontSizeMultiplier={1.3}>
          {receipt === 'saved' ? 'Saved! Your hits count for the team.' : receipt === 'saving' ? 'Sending your hits...' : receiptNote ?? 'Not saved yet. We will keep trying.'}</Text>
      </View>}
      <View style={styles.chips}>
        <Chip label="Bonks" value={Number(meta.bonks ?? 0)} />
        <Chip label="Smashes" value={Number(meta.smashes ?? 0)} />
        {Number(meta.blocks ?? 0) > 0 ? <Chip label="Blocks" value={`${Number(meta.blocks ?? 0)}/${Number(meta.inks)}`} />
          : <Chip label="Perfects" value={Number(meta.perfects ?? 0)} />}
      </View>

      {!won && !noHits && n.can && onAgain && warmNext && <View style={styles.warm} accessible accessibilityLabel="Head start earned: your next attack starts with a free fin">
        <Image source={BASH_ART.finFull} style={{ width: 20, height: 20 }} contentFit="contain" />
        <Text style={styles.warmText} maxFontSizeMultiplier={1.2}>HEAD START EARNED</Text>
      </View>}
      {!won && !noHits && n.can && onAgain ? <>
        <Pressable accessibilityRole="button" onPress={once(onAgain)} style={({ pressed: p }) => [styles.again, p && { transform: [{ scale: 0.97 }] }]}
          accessibilityLabel={`Attack again for ${next?.energyCost} Energy${warmNext ? ', with a free head start fin' : ''}. You have ${n.energyAfter} Energy.`}>
          {warmNext && <Image source={BASH_ART.finFull} style={styles.againFin} contentFit="contain" />}
          <Text style={styles.againText}>ATTACK AGAIN</Text>
          <View style={styles.cost}><GameIcon name="energy" size={22} /><Text style={styles.costText}>{next?.energyCost}</Text></View>
        </Pressable>
        <Text style={styles.wallet}>You have <Text style={styles.walletNum}>{n.energyAfter}</Text> Energy  ·  {n.attacksAfter} {n.attacksAfter === 1 ? 'attack' : 'attacks'} left</Text>
        <Pressable accessibilityRole="button" onPress={once(claim)} style={styles.done} hitSlop={8}><Text style={styles.doneText}>Done</Text></Pressable>
      </> : <>
        {!noHits && n.reason && <Text style={styles.wallet}>{n.reason}</Text>}
        <Pressable accessibilityRole="button" onPress={once(claim)} style={[styles.again, styles.doneBig]}>
          <Text style={[styles.againText, { color: BRAND.navy }]}>{noHits ? 'BACK' : 'DONE'}</Text>
        </Pressable>
      </>}
      {perfLine ? <Text style={styles.perf}>{perfLine}</Text> : null}
    </View>
  );
}

function Loot({ icon, n, count = false, reduced = false }: { icon: 'coins' | 'xp' | 'energy' | 'parts'; n: number; count?: boolean; reduced?: boolean }) {
  const word = icon === 'xp' ? ' XP' : icon === 'parts' ? ' Parts' : '';
  // Team win: the loot counts up after the chest opens.
  return <View style={styles.lootItem}><GameIcon name={icon} size={26} />
    {count ? <CountUpText value={n} delayMs={reduced ? 0 : 1000} durationMs={reduced ? 1 : 650} suffix={word} reducedMotion={reduced} style={styles.lootNum} />
      : <Text style={styles.lootNum}>{n}{word}</Text>}</View>;
}
function Chip({ label, value }: { label: string; value: number | string }) {
  return <View style={styles.chip}><Text style={styles.chipNum}>{value}</Text><Text style={styles.chipLabel}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  card: { width: '92%', backgroundColor: BRAND.cream, borderRadius: 26, borderWidth: 4, borderColor: BRAND.navy, padding: 16, paddingTop: 24 },
  banner: { position: 'absolute', top: -20, alignSelf: 'center', backgroundColor: BRAND.blue, borderRadius: 16, borderWidth: 3, borderColor: BRAND.navy,
    paddingHorizontal: 16, paddingVertical: 4 },
  bannerWin: { backgroundColor: BRAND.gold },
  bannerText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.white, letterSpacing: 0.6, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  best: { position: 'absolute', right: 12, top: 18, backgroundColor: BRAND.red, borderRadius: 10, borderWidth: 2, borderColor: BRAND.white,
    paddingHorizontal: 8, paddingVertical: 2, transform: [{ rotate: '8deg' }] },
  bestText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.white },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bossPic: { width: 76, height: 76 },
  perf: { marginTop: 4, fontSize: 9, color: '#333', textAlign: 'center' },
  stamp: { position: 'absolute', left: 4, top: 22, paddingHorizontal: 5, paddingVertical: 1, borderWidth: 3, borderColor: BRAND.red, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.85)', transform: [{ rotate: '-14deg' }] },
  stampText: { fontFamily: 'Shark', fontSize: 15, lineHeight: 15, color: BRAND.red, textAlign: 'center' },
  kicker: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navySoft, letterSpacing: 0.4 },
  dmg: { alignSelf: 'stretch', textAlign: 'left', fontFamily: 'Shark', fontSize: 48, color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0, padding: 0 },
  zero: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy, marginTop: 4 },
  rate: { fontFamily: 'Knockout', fontSize: 14, color: BRAND.navySoft },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 4 },
  starSlot: { width: 46, height: 46 },
  raid: { marginTop: 10 },
  hpTrack: { height: 20, borderRadius: 10, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.sky, overflow: 'hidden' },
  hpGold: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND.gold },
  hpRed: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND.red },
  raidLine: { marginTop: 4, fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, textAlign: 'center' },
  loot: { marginTop: 10, backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 2, borderColor: BRAND.sky, paddingVertical: 8, alignItems: 'center' },
  warm: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14,
    borderWidth: 2, borderColor: BRAND.navy, backgroundColor: BRAND.gold },
  warmText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
  againFin: { width: 26, height: 26, marginRight: 6 },
  chest: { position: 'absolute', right: 4, top: -16, width: 52, height: 52 },
  lootTitle: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navySoft },
  lootRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  lootItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lootNum: { fontFamily: 'Shark', fontSize: 19, color: BRAND.navy },
  receipt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  receiptErr: { backgroundColor: '#ffe3df', borderRadius: 10, padding: 4 },
  receiptText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.navy, flexShrink: 1, textAlign: 'center' },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 },
  chip: { flex: 1, alignItems: 'center', backgroundColor: BRAND.sky, borderRadius: 12, paddingVertical: 4 },
  chipNum: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  chipLabel: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.navySoft },
  again: { marginTop: 14, minHeight: 64, borderRadius: 20, backgroundColor: BRAND.red, borderWidth: 3, borderColor: BRAND.navy, borderBottomWidth: 7,
    borderBottomColor: BRAND.redLip, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  doneBig: { backgroundColor: BRAND.gold, borderBottomColor: BRAND.goldLip },
  againText: { fontFamily: 'Shark', fontSize: 24, color: BRAND.white, letterSpacing: 0.5 },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: BRAND.cream, borderRadius: 14, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 8, paddingVertical: 2 },
  costText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  wallet: { marginTop: 6, fontFamily: 'Knockout', fontSize: 15, color: BRAND.navy, textAlign: 'center' },
  walletNum: { fontFamily: 'Shark', color: BRAND.navy },
  done: { alignSelf: 'center', marginTop: 6, minHeight: 44, minWidth: 120, alignItems: 'center', justifyContent: 'center' },
  doneText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navySoft, textDecorationLine: 'underline' },
});

/** Team win: the loot chest pops open over the loot row (a reason to come back to the next raid). The shell's own
 * confetti (3 stars, not under Reduce Motion) is the celebration burst. */
function ChestPop({ reduced }: { reduced: boolean }) {
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withDelay(700, withSpring(1, { damping: 6, stiffness: 220 }));
    const t = setTimeout(() => {
      GameAudio.play('fx.coin', { volume: 1, pitch: 7 }); haptic('success');
    }, 760);
    const t2 = setTimeout(() => { GameAudio.play('fx.coin', { volume: 0.9, pitch: 10 }); haptic('tapLight'); }, 1250);
    return () => { clearTimeout(t); clearTimeout(t2); };
  }, [v, reduced]);
  const style = useAnimatedStyle(() => ({ opacity: v.value > 0.02 ? 1 : 0, transform: [{ scale: v.value }, { rotate: `${(1 - v.value) * -20}deg` }] }));
  return <>
    <Animated.View style={[styles.chest, style]} pointerEvents="none">
      <Image source={CHEST_OPEN} style={StyleSheet.absoluteFill} contentFit="contain" />
    </Animated.View>
  </>;
}

/** Team win: the emptied HP bar flashes white twice once it has drained. */
function EmptyFlash() {
  const v = useSharedValue(0);
  useEffect(() => { v.value = withDelay(1600, withSequence(withTiming(1, { duration: 110 }), withTiming(0, { duration: 160 }),
    withTiming(1, { duration: 110 }), withTiming(0, { duration: 260 }))); }, [v]);
  const a = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: BRAND.white, zIndex: 2 }, a]} />;
}
