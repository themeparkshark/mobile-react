/**
 * Boss Bash result: what you did to the boss, what the team still needs, what
 * you win if the team finishes it, and the next attack with its cost and your
 * Energy right on the button. Numbers are the server's formula (home rate in).
 */
import { Image } from 'expo-image';
// Saves belong to the signed-in player, not the phone.
import AsyncStorage from '../../../gamekit/core/playerStorage';
import { useEffect, useRef, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { initialWindowMetrics } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { BossId } from '../../../api/endpoints/parks/raid';
import { BOSS_ART } from '../../../components/boss/bossArt';
import { CountUpText, haptic, type ShellResultsArgs } from '../../../gamekit';
import { GameAudio } from '../../../gamekit/audio/GameAudio';
import { BRAND } from '../../../ui/tokens';
import GameIcon from '../../../ui/GameIcon';
import { BASH_ART } from './art';
import { ResultsRibbon } from '../../../gamekit/results/ResultsRibbon';
import { bossTitle } from '../../../gamekit/results/feelings';
import { ResultChip } from '../../../gamekit/results/ResultsCard';
import { ResultSecondaryButton } from '../../../gamekit/results/ResultButtons';

import { bashChips } from './bashChips';

const CHEST_OPEN = require('../../../../assets/images/daily/chest-open.png');

export interface BashNext {
  /** Attacks left before this round is sent. */
  readonly attacksLeft: number;
  /** Energy before this round is charged. */
  readonly energy: number;
  readonly energyCost: number;
}
export interface BashRewards { readonly coins: number; readonly xp: number; readonly energy: number; readonly parts: number }

/** Minutes left in the raid (null when over or unknown). */
export function raidMinutesLeft(endsAt: string | undefined, now: number): number | null {
  if (!endsAt) return null;
  const ms = new Date(endsAt).getTime() - now;
  return ms <= 0 ? null : Math.max(1, Math.ceil(ms / 60000));
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
  // One KO mark per card: the finisher's crown in the third star slot, or
  // (a 3-star finish, or a team win) the KO! pill, never both.
  const koInStars = ko && stars < 3 && !noHits;
  const drain = useSharedValue(0);
  const starsIn = [useSharedValue(0), useSharedValue(0), useSharedValue(0)];
  const pressed = useRef(false);
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    drain.value = reduced ? 1 : withDelay(700, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
    starsIn.forEach((s, i) => {
      if (i >= stars) return;
      const at = 450 + i * 260;
      // Reduce Motion and a won raid: the stars are simply there (no slam to wait for).
      s.value = reduced || won ? 1 : withDelay(at, withSequence(withTiming(1.4, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 260 })));
      const t = setTimeout(() => { GameAudio.play('fx.reveal', { pitch: i * 3, volume: 0.6 }); haptic('hitMedium'); }, reduced || won ? 0 : at);
      timers.push(t);
    });
    return () => timers.forEach(clearTimeout);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pct = (v: number) => `${Math.min(100, (Math.max(0, v) / Math.max(1, hpMax)) * 100)}%` as `${number}%`;
  // The boss's health drains on the UI thread as a scale, never a width (no layout per frame).
  const fill = useAnimatedStyle(() => {
    const v = startHp - (startHp - hpAfter) * drain.value;
    return { transform: [{ scaleX: startHp > 0 ? Math.max(0, Math.min(1, v / startHp)) : 0 }] };
  });
  const s0 = useAnimatedStyle(() => ({ transform: [{ scale: starsIn[0].value }], opacity: starsIn[0].value > 0 ? 1 : 0 }));
  const s1 = useAnimatedStyle(() => ({ transform: [{ scale: starsIn[1].value }], opacity: starsIn[1].value > 0 ? 1 : 0 }));
  const s2 = useAnimatedStyle(() => ({ transform: [{ scale: starsIn[2].value }], opacity: starsIn[2].value > 0 ? 1 : 0 }));
  const left = raidMinutesLeft(endsAt, Date.now());
  const chips = bashChips(meta);
  const once = (f?: () => void) => () => { if (pressed.current || !f) return; pressed.current = true; f(); };

  return (
    // Bottom-anchored like the Duel, Sharky and the shared card: the arena
    // stays above it as the scene, never sky under a floating card.
    <View style={[styles.stage, { height: Dimensions.get('window').height }]} pointerEvents="box-none">
    <View style={styles.card} accessibilityViewIsModal>
      {/* The one results title every game shares: Alex's ribbon over the card's top edge. */}
      {/* The star word waits for the last star (no spoilers); a won raid's stars are simply there. */}
      <ResultsRibbon title={bossTitle({ won, ko, noHits, stars, newBest: best && !noHits })} delayMs={reduced || won || noHits ? 0 : 450 + Math.max(0, Math.min(3, stars) - 1) * 260 + 120}
        reducedMotion={reduced} style={styles.ribbonWrap} />
      <View style={styles.head}>
        <View>
          <Image source={won ? (defeated ?? portrait ?? BOSS_ART[boss]) : (portrait ?? BOSS_ART[boss])} style={styles.bossPic} contentFit="contain" />
          {won && <View style={styles.stamp}><Text style={styles.stampText} maxFontSizeMultiplier={1}>BOSS{'\n'}DOWN</Text></View>}
        </View>
        <View style={{ flex: 1 }}>
          {/* Pictures, not a sentence: swords (your hits) next to the big number. */}
          {noHits ? <View style={styles.kept} accessible accessibilityLabel="No hits this time. No Energy was spent">
            <GameIcon name="energy" size={24} /><Text style={styles.zero}>ENERGY KEPT</Text></View>
            : <View accessible accessibilityLabel={`You hit ${bossName} for ${damage.toLocaleString()}${teamDamage > 0 ? `. Your team has done ${(teamDamage + damage).toLocaleString()}` : ''}${rate < 1 ? `. From home you hit at ${Math.round(rate * 100)} percent power` : ''}${capped ? '. That is the most one shark can do to this boss' : ''}`}>
              <View style={styles.dmgRow}>
                <GameIcon name="swords" size={34} />
                <CountUpText value={damage} delayMs={reduced ? 0 : 200} durationMs={reduced ? 1 : 700} style={styles.dmg} />
              </View>
            </View>}
          {/* The same gold crown NEW BEST! pill every results card uses. */}
          {best && !noHits ? <View style={styles.newBest}><GameIcon name="crown" size={20} /><Text style={styles.newBestText}>NEW BEST!</Text></View> : null}
          {/* Pictures, not sentences: a pin for a hit from home, a lock when this
              shark hit the most it can. The full words are spoken. */}
          {!noHits && (rate < 1 || capped) ? <View style={styles.tags} importantForAccessibility="no-hide-descendants">
            {rate < 1 ? <View style={styles.tag}><GameIcon name="pin" size={16} /><Text style={styles.tagText}>FROM HOME</Text></View> : null}
            {capped ? <View style={styles.tag}><GameIcon name="lock" size={16} /><Text style={styles.tagText}>MAX HIT</Text></View> : null}
          </View> : null}
        </View>
      </View>

      {!noHits && <View style={styles.stars}>
        {[s0, s1, s2].map((st, i) => (koInStars && i === 2)
          // The finisher's card: a gold KO crown where a grey third star would sit.
          ? <View key={i} style={styles.starSlot} accessible accessibilityLabel="Knockout crown: you finished the boss">
            <GameIcon name="crown" size={38} /><Text style={styles.koTag} maxFontSizeMultiplier={1}>KO</Text></View>
          // The same star every results card draws: pale blue until it lands gold.
          : <View key={i} style={styles.starSlot}>
          <View style={StyleSheet.absoluteFill}><GameIcon name="star" size={46} mono="#9cc9ec" /></View>
          <Animated.View style={[StyleSheet.absoluteFill, st]}><GameIcon name="star" size={46} /></Animated.View>
        </View>)}
      </View>}

      <View style={styles.raid}>
        {/* Won: the stamp and the KO pill say it; an empty pale bar read as broken. */}
        {/* A health bar that empties, in pictures: the red next to the boss's
            face is all it has left (red is HP only, never a reward). What got
            knocked out is light: your swords sit on your chunk (white) and a
            shark on the team's earlier chunk (sky). */}
        {/* The bar is the whole raid read: minutes left and sharks fighting are
            spoken on it, not drawn (about six numbers on the card, never ten). */}
        {!won && <View style={styles.hpRow} accessible
          accessibilityLabel={`${hpAfter.toLocaleString()} HP left${left ? `, ${left} minutes left` : ''}${fighters > 0 ? `, ${fighters} sharks fighting` : ''}`}>
          <Image source={portrait ?? BOSS_ART[boss]} style={styles.hpBoss} contentFit="contain" />
          <View style={styles.hpWrap}>
            {!noHits && startHp > hpAfter ? <View style={[styles.hpMark, { left: pct((startHp + hpAfter) / 2) }]}>
              <GameIcon name="swords" size={18} />
            </View> : null}
            {hpMax - startHp >= hpMax * 0.12 ? <View style={[styles.hpMark, { left: pct((hpMax + startHp) / 2) }]}>
              <GameIcon name="shark" size={18} />
            </View> : null}
            <View style={styles.hpTrack}>
              <View style={[styles.hpMine, { width: pct(startHp) }]} />
              <Animated.View style={[styles.hpLeft, { width: pct(startHp) }, fill]} />
            </View>
          </View>
        </View>}
        {/* Won: the KO crown pill, the same picture as the finisher's star slot
            and the loot strip (no sentence to read). */}
        {won && !koInStars ? <View style={styles.koPill} accessible accessibilityLabel="Boss knocked out">
          <View style={styles.lootKo}><GameIcon name="crown" size={26} /><Text style={styles.koTag} maxFontSizeMultiplier={1}>KO</Text></View>
          <Text style={styles.koPillText} maxFontSizeMultiplier={1}>KO!</Text>
        </View> : null}
      </View>

      {rewards && <View style={styles.loot} accessible accessibilityLabel={won ? `Yours: ${rewards.coins} coins, ${rewards.xp} XP, ${rewards.energy} Energy${rewards.parts ? `, ${rewards.parts} Ride Parts` : ''}`
        : `If your team knocks it out you get ${rewards.coins} coins, ${rewards.xp} XP, ${rewards.energy} Energy${rewards.parts ? `, ${rewards.parts} Ride Parts` : ''}`}>
        {/* Not won yet: the KO crown (the same mark as the finisher's star
            slot), an equals sign, then the prizes pale with a lock, so the
            strip reads "knock it out = these", never "you won these". Won: the
            prizes are bright and count up, and the open chest sits in its own
            slot at the end of the row (it never covers a count). */}
        <View style={styles.lootRow}>
          {won ? null : <View style={styles.lootIf} importantForAccessibility="no-hide-descendants">
            <View style={styles.lootKo}><GameIcon name="crown" size={24} /><Text style={styles.koTag} maxFontSizeMultiplier={1}>KO</Text></View>
            <Text style={styles.lootEq}>=</Text>
          </View>}
          <View style={[styles.lootItems, rewards.parts > 0 && styles.lootItemsTight, !won && styles.lootLocked]}>
            <Loot icon="coins" n={rewards.coins} count={won} reduced={reduced} small={rewards.parts > 0} />
            <Loot icon="xp" n={rewards.xp} count={won} reduced={reduced} small={rewards.parts > 0} />
            <Loot icon="energy" n={rewards.energy} count={won} reduced={reduced} small={rewards.parts > 0} />
            {rewards.parts > 0 && <Loot icon="parts" n={rewards.parts} count={won} reduced={reduced} small />}
          </View>
          {/* Four prizes fill the row: the pale prizes say "not yet" without the lock. */}
          {won ? <ChestPop reduced={reduced} /> : rewards.parts > 0 ? null : <GameIcon name="lock" size={20} />}
        </View>
      </View>}

      {receipt && !noHits && <View style={[styles.receipt, receipt === 'error' && styles.receiptErr]} accessibilityLiveRegion="polite"
        accessible accessibilityLabel={receipt === 'saved' ? 'Saved for the team' : undefined}>
        <GameIcon name={receipt === 'saved' ? 'check' : receipt === 'error' ? 'info' : 'timer'} size={18} />
        <Text style={[styles.receiptText, receipt === 'error' && styles.receiptTextErr]} maxFontSizeMultiplier={1.3}>
          {receipt === 'saved' ? 'SAVED!' : receipt === 'saving' ? 'SENDING...' : receiptNote ?? 'Not saved yet. We will keep trying.'}</Text>
      </View>}
      {/* Brags only on a new best (the card stays a one-glance read): the
          shared chips, two at most, a zero is never a chip. */}
      {best && chips.length ? <View style={styles.chips}>
        {chips.slice(0, 1).map((c) => <ResultChip key={c.label} label={c.label} value={c.value} />)}
      </View> : null}

      {!won && !noHits && n.can && onAgain && warmNext && <View style={styles.warm} accessible accessibilityLabel="Head start earned: your next attack starts with a free fin">
        <Image source={BASH_ART.finFull} style={{ width: 20, height: 20 }} contentFit="contain" />
        <Text style={styles.warmText} maxFontSizeMultiplier={1.2}>HEAD START EARNED</Text>
      </View>}
      {!won && !noHits && n.can && onAgain ? <>
        <Pressable accessibilityRole="button" onPress={once(onAgain)} style={({ pressed: p }) => [styles.again, p && { transform: [{ scale: 0.97 }] }]}
          accessibilityLabel={`Attack again for ${next?.energyCost} Energy${warmNext ? ', with a free head start fin' : ''}. You have ${n.energyAfter} Energy and ${n.attacksAfter} ${n.attacksAfter === 1 ? 'attack' : 'attacks'} left.`}>
          {warmNext && <Image source={BASH_ART.finFull} style={styles.againFin} contentFit="contain" />}
          <Text style={[styles.againText, { color: BRAND.navy }]}>ATTACK AGAIN</Text>
          <View style={styles.cost}><GameIcon name="energy" size={22} /><Text style={styles.costText}>{next?.energyCost}</Text></View>
        </Pressable>
        {/* Your Energy and the attacks left are spoken on the button, not
            drawn: its cost is the one number a kid needs here. */}
        <ResultSecondaryButton label="DONE" onPress={once(claim)} style={styles.doneBtn} />
      </> : <>
        {!noHits && n.reason && <Text style={styles.wallet}>{n.reason}</Text>}
        <Pressable accessibilityRole="button" onPress={once(claim)} style={[styles.again, styles.doneBig]}>
          <Text style={[styles.againText, { color: BRAND.navy }]}>DONE</Text>
        </Pressable>
      </>}
      {perfLine ? <Text style={styles.perf}>{perfLine}</Text> : null}
    </View>
    </View>
  );
}

function Loot({ icon, n, count = false, reduced = false, small = false }: { icon: 'coins' | 'xp' | 'energy' | 'parts'; n: number; count?: boolean; reduced?: boolean; small?: boolean }) {
  // The icon says what it is (the XP badge, the parts picture): a number only.
  const word = '';
  // Team win: the loot counts up after the chest opens.
  const numStyle = small ? [styles.lootNum, styles.lootNumSmall] : styles.lootNum;
  return <View style={styles.lootItem}><GameIcon name={icon} size={small ? 22 : 26} />
    {count ? <CountUpText value={n} delayMs={reduced ? 0 : 1000} durationMs={reduced ? 1 : 650} suffix={word} reducedMotion={reduced} style={numStyle} />
      : <Text style={numStyle}>{n}{word}</Text>}</View>;
}

const styles = StyleSheet.create({
  // The one results surface every game shares: the blue card with a white border.
  stage: { width: '100%', alignItems: 'center', justifyContent: 'flex-end',
    paddingTop: (initialWindowMetrics?.insets.top ?? 20) + 56, paddingBottom: Math.max(10, initialWindowMetrics?.insets.bottom ?? 0) + 6 },
  card: { width: '92%', backgroundColor: BRAND.blue, borderRadius: 26, borderWidth: 4, borderColor: BRAND.white, padding: 16, paddingTop: 44, marginTop: 30,
    shadowColor: BRAND.navy, shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.28, shadowRadius: 18 },
  ribbonWrap: { position: 'absolute', top: -36, left: -14, right: -14 },
  kept: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  newBest: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: BRAND.gold, borderRadius: 999, borderWidth: 3,
    borderColor: BRAND.navy, paddingHorizontal: 10, paddingVertical: 1, marginTop: 2 },
  newBestText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, marginLeft: 5 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bossPic: { width: 76, height: 76 },
  perf: { marginTop: 4, fontSize: 9, color: '#ffffff', textAlign: 'center' },
  koTag: { position: 'absolute', bottom: -2, fontFamily: 'Shark', fontSize: 12, color: BRAND.white, backgroundColor: BRAND.red,
    paddingHorizontal: 5, borderRadius: 6, overflow: 'hidden' },
  stamp: { position: 'absolute', right: -10, top: -6, paddingHorizontal: 4, paddingVertical: 1, borderWidth: 2, borderColor: BRAND.red, borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.85)', transform: [{ rotate: '-14deg' }] },
  stampText: { fontFamily: 'Shark', fontSize: 11, lineHeight: 11, color: BRAND.red, textAlign: 'center' },
  dmgRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dmg: { flex: 1, textAlign: 'left', fontFamily: 'Shark', fontSize: 48, color: BRAND.gold, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0, padding: 0 },
  zero: { fontFamily: 'Shark', fontSize: 20, color: BRAND.white, marginTop: 4 },
  stars: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginTop: 4 },
  starSlot: { width: 46, height: 46 },
  raid: { marginTop: 10 },
  hpRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  hpBoss: { width: 30, height: 30 },
  hpWrap: { flex: 1, paddingTop: 16 },
  hpMark: { position: 'absolute', top: 0, marginLeft: -9 },
  // Track = the team's earlier hits (gold); your hits are your blue; the red is what the boss has left.
  hpTrack: { height: 20, borderRadius: 10, borderWidth: 3, borderColor: BRAND.navy, backgroundColor: BRAND.sky, overflow: 'hidden' },
  hpMine: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND.white },
  hpLeft: { position: 'absolute', left: 0, top: 0, bottom: 0, backgroundColor: BRAND.red, transformOrigin: 'left' },
  koPill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 6, marginTop: 4, backgroundColor: BRAND.gold, borderRadius: 999,
    borderWidth: 3, borderColor: BRAND.navy, paddingLeft: 8, paddingRight: 14, paddingVertical: 1 },
  koPillText: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy },
  loot: { marginTop: 10, backgroundColor: BRAND.white, borderRadius: 16, borderWidth: 2, borderColor: BRAND.sky, paddingVertical: 8, alignItems: 'center' },
  warm: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 14,
    borderWidth: 2, borderColor: BRAND.navy, backgroundColor: BRAND.gold },
  warmText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy },
  againFin: { width: 26, height: 26, marginRight: 6 },
  // In the row's flow (never absolute over the last count).
  chest: { width: 44, height: 44, marginVertical: -8 },
  lootRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'nowrap' },
  lootItems: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  lootItemsTight: { gap: 8 },
  lootLocked: { opacity: 0.55 },
  lootKo: { width: 30, height: 34, alignItems: 'center', justifyContent: 'center' },
  lootItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lootIf: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  lootEq: { fontFamily: 'Shark', fontSize: 19, color: BRAND.navy },
  lootNum: { fontFamily: 'Shark', fontSize: 19, color: BRAND.navy },
  lootNumSmall: { fontSize: 17 },
  receipt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8 },
  receiptErr: { backgroundColor: '#ffe3df', borderRadius: 10, padding: 4 },
  receiptText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white, flexShrink: 1, textAlign: 'center' },
  receiptTextErr: { color: BRAND.navy },
  chips: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.white, borderRadius: 12, borderWidth: 2, borderColor: BRAND.sky,
    paddingHorizontal: 8, paddingVertical: 2 },
  tagText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy },
  doneBtn: { flex: 0, minHeight: 52, marginTop: 10 },
  // Gold first, like every results card's big button.
  again: { marginTop: 14, minHeight: 64, borderRadius: 20, backgroundColor: BRAND.gold, borderWidth: 3, borderColor: BRAND.navy, borderBottomWidth: 7,
    borderBottomColor: BRAND.goldLip, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  doneBig: { backgroundColor: BRAND.gold, borderBottomColor: BRAND.goldLip },
  againText: { fontFamily: 'Shark', fontSize: 24, color: BRAND.white, letterSpacing: 0.5 },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: BRAND.cream, borderRadius: 14, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 8, paddingVertical: 2 },
  costText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy },
  wallet: { marginTop: 6, fontFamily: 'Knockout', fontSize: 15, color: BRAND.white, textAlign: 'center' },
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
