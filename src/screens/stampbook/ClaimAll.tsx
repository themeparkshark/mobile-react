/**
 * Claim all: every stamp with a reward waiting, opened in one go with one
 * celebration. The stamps sit in a row like gifts; "Claim all!" stamps them
 * one after another (a quick thunk and pop each, about 160 ms apart), the
 * reward totals count up once, then one confetti burst and one fanfare.
 * Titles unlocked in the batch land last, each under a little shark with its
 * own Wear button, so wearing a new title is one tap away.
 *
 * Claims go one by one through the same endpoint the card uses (there is no
 * batch endpoint); a failed one keeps its gift and says so, the rest go on.
 * Reduce Motion: no pops or confetti; sounds, haptics and announcements stay.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { GameIcon } from '../../ui';
import GameButton from '../../ui/GameButton';
import Ribbon from '../../components/Ribbon';
import { DIALOG_CARD } from '../../ui/GameDialog';
import type { GameIconName } from '../../ui/iconNames';
import StampArt from './StampArt';
import { Confetti } from './SlamFx';
import { INK, PAPER } from './StampTile';
import { compactCount, sumRewards, type BookStamp, type RewardTotals as Totals } from './model';

const SHARK = require('../../../assets/images/howto/shark-happy.webp');
type Status = 'waiting' | 'done' | 'failed';
const TOTAL_ICON: Record<keyof Totals, GameIconName> = { energy: 'energy', tickets: 'ticket', xp: 'xp', coins: 'coin' };

export default function ClaimAll({ stamps, visible, reducedMotion, worn, onClaimOne, onWear, onClose }: {
  /** The stamps with rewards waiting when the sheet opened (kept for the whole sheet). */
  readonly stamps: readonly BookStamp[];
  readonly visible: boolean;
  readonly reducedMotion: boolean;
  readonly worn: string | null;
  readonly onClaimOne: (stamp: BookStamp) => Promise<boolean>;
  readonly onWear: (stamp: BookStamp) => Promise<void> | void;
  readonly onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {visible && <Sheet stamps={stamps} reducedMotion={reducedMotion} worn={worn} onClaimOne={onClaimOne} onWear={onWear} onClose={onClose} />}
    </Modal>
  );
}

function Sheet({ stamps, reducedMotion, worn, onClaimOne, onWear, onClose }: {
  stamps: readonly BookStamp[]; reducedMotion: boolean; worn: string | null;
  onClaimOne: (stamp: BookStamp) => Promise<boolean>; onWear: (stamp: BookStamp) => Promise<void> | void; onClose: () => void;
}) {
  const [status, setStatus] = useState<Record<number, Status>>({});
  const [phase, setPhase] = useState<'ready' | 'claiming' | 'done'>('ready');
  const [got, setGot] = useState<Totals>({ energy: 0, tickets: 0, xp: 0, coins: 0 });
  const [party, setParty] = useState(false);
  const [wearing, setWearing] = useState<string | null>(null);
  const alive = useRef(true);
  // Short phones (iPhone SE): smaller gifts and a shorter titles list, so the sheet stays inside the safe area.
  const compact = useWindowDimensions().height < 700;
  useEffect(() => () => { alive.current = false; }, []);
  const all = sumRewards(stamps);
  const kinds = (Object.keys(all) as (keyof Totals)[]).filter(k => all[k] > 0);
  const failed = stamps.filter(s => status[s.id] === 'failed');

  const claimAll = useCallback(async () => {
    if (phase === 'claiming') return;
    setPhase('claiming');
    haptic('hitMedium');
    const queue = stamps.filter(s => status[s.id] !== 'done');
    for (const stamp of queue) {
      const ok = await onClaimOne(stamp);
      if (!alive.current) return;
      setStatus(prev => ({ ...prev, [stamp.id]: ok ? 'done' : 'failed' }));
      if (ok) {
        haptic('hitRigid');
        playSfx('fx.hit', 0.7);
        setGot(prev => ({
          energy: prev.energy + stamp.rewards.energy, tickets: prev.tickets + stamp.rewards.tickets,
          xp: prev.xp + stamp.rewards.xp, coins: prev.coins + stamp.rewards.coins,
        }));
      }
      await new Promise(r => setTimeout(r, reducedMotion ? 60 : 160));
    }
    if (!alive.current) return;
    setPhase('done');
    haptic('success');
    playSfx('fx.reward');
    if (!reducedMotion) { setParty(true); setTimeout(() => alive.current && setParty(false), 1600); }
    AccessibilityInfo.announceForAccessibility('Rewards claimed');
  }, [phase, stamps, status, onClaimOne, reducedMotion]);

  const titles = stamps.filter(s => !!s.rewards.title && status[s.id] === 'done');
  const label = phase === 'claiming' ? 'Stamping...' : phase === 'done' ? (failed.length ? `Try ${failed.length} again` : 'Done') : `Claim all ${stamps.length}!`;

  return (
    <View style={styles.root}>
      <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={phase === 'claiming' ? undefined : onClose} accessible={false} />
      <View style={styles.card} accessibilityViewIsModal>
        <View style={styles.lip} />
        <View style={styles.body}>
          <View style={styles.ribbon}><Ribbon text="Your rewards!" /></View>
          {phase !== 'claiming' && (
            <Pressable onPress={onClose} hitSlop={14} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
              <GameIcon name="close" size={44} />
            </Pressable>
          )}
          <View style={styles.grid}>
            {stamps.map(s => <Gift key={s.id} stamp={s} status={status[s.id] ?? 'waiting'} reducedMotion={reducedMotion} compact={compact} />)}
          </View>
          <View style={styles.totals} accessible accessibilityLabel={kinds.map(k => `${phase === 'ready' ? all[k] : got[k]} ${k}`).join(', ')}>
            {kinds.map(k => (
              <View key={k} style={styles.total}>
                <View style={styles.disc}><GameIcon name={TOTAL_ICON[k]} size={24} /></View>
                <Text style={styles.totalText} maxFontSizeMultiplier={1.2}>+{compactCount(phase === 'ready' ? all[k] : got[k])}</Text>
              </View>
            ))}
          </View>
          {titles.length > 0 && (
            <ScrollView style={[styles.titles, compact && styles.titlesCompact]} contentContainerStyle={{ gap: 8 }}>
              {titles.map(s => {
                const isWorn = (wearing ?? worn) === s.rewards.title;
                return (
                  <View key={s.id} style={styles.titleRow}>
                    <View style={styles.titleWear}>
                      <Image source={SHARK} style={styles.shark} contentFit="contain" />
                      <View style={styles.pill}>
                        <GameIcon name="crown" size={16} />
                        <Text style={styles.pillText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2}>{s.rewards.title}</Text>
                      </View>
                    </View>
                    <Text style={styles.newTitle} maxFontSizeMultiplier={1.2}>New title!</Text>
                    <Pressable disabled={isWorn} accessibilityRole="button" accessibilityLabel={isWorn ? `Wearing ${s.rewards.title}` : `Wear the title ${s.rewards.title}`}
                      onPress={() => { setWearing(s.rewards.title); haptic('success'); playSfx('ui.confirm', 0.8); void onWear(s); }}
                      style={({ pressed }) => [styles.wear, isWorn && styles.wearOn, pressed && styles.pressed]}>
                      <GameIcon name={isWorn ? 'check' : 'crown'} size={16} />
                      <Text style={styles.wearText} maxFontSizeMultiplier={1.2}>{isWorn ? 'Wearing' : 'Wear'}</Text>
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}
          {failed.length > 0 && phase === 'done' && (
            <Text style={styles.message} accessibilityLiveRegion="polite">Some gifts did not come through. Tap to try again.</Text>
          )}
          <View style={styles.actions}>
            <GameButton label={label} icon={phase === 'done' && !failed.length ? 'check' : 'gift'} loading={phase === 'claiming'}
              onPress={phase === 'claiming' ? undefined : phase === 'done' && !failed.length ? onClose : () => { void claimAll(); }} />
          </View>
          {party && <View pointerEvents="none" style={StyleSheet.absoluteFill}><Confetti width={340} height={520} seed={stamps.length} count={36} /></View>}
        </View>
      </View>
    </View>
  );
}

/** One gift-wrapped stamp: the art waits under a red gift tag, then stamps in with a pop and a check. */
function Gift({ stamp, status, reducedMotion, compact }: { stamp: BookStamp; status: Status; reducedMotion: boolean; compact: boolean }) {
  const pop = useSharedValue(1);
  useEffect(() => {
    if (status !== 'done' || reducedMotion) return;
    pop.value = withSequence(withTiming(1.25, { duration: 110, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 10, stiffness: 300 }));
  }, [status, pop, reducedMotion]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Animated.View style={[styles.gift, compact && styles.giftCompact, status === 'done' && styles.giftDone, style]} accessible
      accessibilityLabel={`${stamp.name}${status === 'done' ? ', claimed' : status === 'failed' ? ', not claimed yet' : ''}`}>
      <StampArt stamp={stamp} size="thumb" />
      {status === 'done' ? (
        <View style={styles.check}><GameIcon name="check" size={20} /></View>
      ) : (
        <View style={[styles.tag, status === 'failed' && styles.tagFailed]}><GameIcon name={status === 'failed' ? 'retry' : 'gift'} size={16} /></View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  backdrop: { backgroundColor: 'rgba(5,52,110,0.82)' },
  card: { width: '100%', maxWidth: 370, borderRadius: 24, borderWidth: 3, borderColor: '#0B2A55', backgroundColor: '#0B2A55' },
  lip: { position: 'absolute', left: 0, right: 0, top: 8, bottom: -7, borderRadius: 22, backgroundColor: '#045089' },
  body: { ...DIALOG_CARD, alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, paddingTop: 40, gap: 12 },
  ribbon: { position: 'absolute', top: -34, left: 18, right: 18, alignItems: 'center' },
  close: { position: 'absolute', top: -18, right: -14, zIndex: 5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10 },
  gift: {
    width: 70, height: 70, borderRadius: 18, backgroundColor: PAPER, borderWidth: 3, borderColor: '#E3262E', padding: 6,
  },
  giftDone: { borderColor: '#FFFFFF' },
  giftCompact: { width: 56, height: 56, padding: 4 },
  titlesCompact: { maxHeight: 120 },
  tag: {
    position: 'absolute', top: -8, right: -8, width: 28, height: 28, borderRadius: 14, backgroundColor: '#E3262E', borderWidth: 2.5,
    borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  tagFailed: { backgroundColor: '#8A97AD' },
  check: { position: 'absolute', top: -8, right: -8 },
  totals: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14 },
  total: { alignItems: 'center', minWidth: 58 },
  disc: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: PAPER, borderWidth: 3, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  totalText: { fontFamily: 'Shark', fontSize: 18, color: '#FFFFFF', marginTop: 2, textShadowColor: '#05346e', textShadowOffset: { width: 1.5, height: 1.5 }, textShadowRadius: 0 },
  titles: { alignSelf: 'stretch', maxHeight: 200 },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,207,59,0.16)', borderRadius: 16, borderWidth: 2,
    borderColor: '#FFCF3B', padding: 8,
  },
  titleWear: { alignItems: 'center', maxWidth: '50%' },
  shark: { width: 44, height: 48, marginBottom: -8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFCF3B', borderRadius: 14, paddingHorizontal: 8, minHeight: 30,
    borderWidth: 2, borderColor: '#FFFFFF', borderBottomWidth: 4, borderBottomColor: '#D99A00',
  },
  pillText: { flexShrink: 1, fontFamily: 'Shark', fontSize: 15, color: INK },
  newTitle: { flex: 1, fontFamily: 'Shark', fontSize: 17, color: '#FFFFFF' },
  wear: {
    flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: 14, backgroundColor: '#FFCF3B',
    borderWidth: 2.5, borderColor: '#FFFFFF', borderBottomWidth: 4, borderBottomColor: '#C98A00',
  },
  wearOn: { backgroundColor: '#E2F6FF', borderBottomColor: '#9FB2C9' },
  wearText: { fontFamily: 'Shark', fontSize: 16, color: INK },
  pressed: { opacity: 0.85, transform: [{ scale: 0.97 }] },
  message: { fontFamily: 'Knockout', fontSize: 15, color: '#E2F6FF', textAlign: 'center' },
  actions: { alignSelf: 'stretch' },
});
