/**
 * The big stamp card, built like Alex's popups: the blue modal card with a
 * white rim and chunky lip, the gold ribbon title, his round X, glossy reward
 * tokens and his yellow button.
 *
 * Earned, first view: the stamp hovers, DROPS (exp ease-in), hit-stops, squashes
 * and settles with one overshoot; an irregular ink blot and droplets hit the
 * page, the card shakes and flashes, one layered thunk and a rigid haptic land
 * on the impact frame (predicted timer, not a JS hop). Rare and up add a colour
 * burst; legendary adds the rotating sunburst, holo foil, gold dust, a longer
 * hit-stop and a two-note fanfare.
 * Earned, repeat view: a quick pop-in; tap the stamp to re-stamp it (a toy).
 * Claim: re-press, reward tokens pop, particles arc into the HUD counters with
 * rising ticks, the counters count up, "Got it!", then "Next reward (n left)".
 * Locked: the ghost breathes in the section colour and bleeds into colour from
 * the bottom past 75%; a positive "how close" line, a pictogram and Go!.
 * Reduce Motion: fades only; sound and haptics stay.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { GameAudio } from '../../gamekit/audio/GameAudio';
import { rarityToneByName } from '../../constants/coinTiers';
import GameIcon from '../../ui/GameIcon';
import GameButton from '../../ui/GameButton';
import Ribbon from '../../components/Ribbon';
import { DIALOG_CARD } from '../../ui/GameDialog';
import type { GameIconName } from '../../ui/iconNames';
import StampArt from './StampArt';
import Foil from './Foil';
import { Confetti, InkBurst, Particle, RarityBurst, Sunburst } from './SlamFx';
import {
  bleedFraction, earnedDate, hasRewards, hasShine, progressLabel, rarityRank, remainingLine, requirement, rewardChips, rewardSpeech,
  type BookStamp,
} from './model';

const ART = 220;
type Kind = 'energy' | 'tickets' | 'xp' | 'coins' | 'title';
const KIND_ICON: Record<Kind, GameIconName> = { energy: 'energy', tickets: 'ticket', xp: 'xp', coins: 'coin', title: 'crown' };
const HUD_KINDS: Kind[] = ['energy', 'tickets', 'xp'];

export interface Wallet { energy: number; tickets: number; xp: number }

interface Props {
  readonly stamp: BookStamp | null;
  readonly accent: string;
  readonly reducedMotion: boolean;
  /** First view after earning: the full slam. Repeat views get a pop-in. */
  readonly fresh: boolean;
  readonly wallet: Wallet;
  readonly claiming: boolean;
  readonly equipping: boolean;
  readonly message: string | null;
  readonly wearingTitle: boolean;
  /** Claimable stamps left after this one (the chain). */
  readonly nextCount: number;
  readonly onClaim: () => Promise<boolean>;
  readonly onNext: () => void;
  readonly onGo: (stamp: BookStamp) => void;
  readonly onToggleTitle: () => void;
  readonly onClose: () => void;
}

export default function StampCard(props: Props) {
  const { stamp } = props;
  return (
    <Modal visible={!!stamp} transparent animationType="fade" onRequestClose={props.onClose} statusBarTranslucent>
      {stamp && <CardBody key={stamp.id} {...props} stamp={stamp} />}
    </Modal>
  );
}

interface Burst { id: number; icon: GameIconName; sx: number; sy: number; ex: number; ey: number; delay: number; lift: number }

function CardBody({ stamp, accent, reducedMotion, fresh, wallet, claiming, equipping, message, wearingTitle, nextCount,
  onClaim, onNext, onGo, onToggleTitle, onClose }: Props & { stamp: BookStamp }) {
  const tone = rarityToneByName(stamp.rarity);
  const rank = rarityRank(stamp.rarity);
  const legendary = stamp.earned && stamp.rarity === 'legendary';
  const req = requirement(stamp);
  const bleed = bleedFraction(stamp);

  const card = useSharedValue(reducedMotion ? 1 : 0.86);
  const shake = useSharedValue(0);
  const flash = useSharedValue(0);
  const sx = useSharedValue(1);
  const sy = useSharedValue(1);
  const lift = useSharedValue(0);
  const tilt = useSharedValue(0);
  const fade = useSharedValue(0);
  const hit = useSharedValue(0);
  const foil = useSharedValue(0);
  const breathe = useSharedValue(0);
  const dateIn = useSharedValue(stamp.earned && !fresh ? 1 : 0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  const [shown, setShown] = useState<Wallet>(wallet);
  const [claimed, setClaimed] = useState(stamp.rewardClaimed);
  const [gotIt, setGotIt] = useState(false);
  /** From a successful claim until the cascade finishes: no other button shows. */
  const [cascading, setCascading] = useState(false);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [party, setParty] = useState(false);
  const chipPop = useSharedValue(0);
  const layout = useRef<{ hud: Record<string, { x: number; y: number }>; chips: Record<string, { x: number; y: number }>; chipsRow: { x: number; y: number }; hudRow: { x: number; y: number } }>(
    { hud: {}, chips: {}, chipsRow: { x: 0, y: 0 }, hudRow: { x: 0, y: 0 } });

  const impact = useCallback((celebrate: boolean) => {
    haptic('hitRigid');
    playSfx('fx.hit');
    later(80, () => playSfx('ui.confirm', 0.7));
    if (rank >= 5) later(260, () => { playSfx('fx.reveal'); later(320, () => playSfx('fx.coinFull', 0.5)); });
    else if (rank >= 3) later(220, () => playSfx('fx.reveal', 0.85));
    if (celebrate) later(150, () => { haptic('success'); playSfx('fx.reward'); });
    // Legendary: gold confetti on the hit.
    if (rank >= 5 && !reducedMotion) { setParty(true); later(1500, () => setParty(false)); }
  }, [rank, later, reducedMotion]);

  /** The full slam: hover, drop, hit-stop, squash, settle, ink, shake, flash. */
  const slam = useCallback((celebrate: boolean) => {
    if (reducedMotion) {
      fade.value = withTiming(1, { duration: 180 });
      hit.value = 1;
      dateIn.value = withTiming(1, { duration: 150 });
      impact(celebrate);
      return;
    }
    const hold = rank >= 5 ? 120 : 50;
    fade.value = 0; hit.value = 0;
    sx.value = 1.35; sy.value = 1.35; lift.value = -6; tilt.value = -12;
    fade.value = withTiming(1, { duration: 100 });
    // Anticipation: hover and rise.
    lift.value = withSequence(withTiming(-12, { duration: 140, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 160, easing: Easing.in(Easing.exp) }));
    tilt.value = withDelay(140, withTiming(-3, { duration: 160, easing: Easing.in(Easing.exp) }));
    const drop = { duration: 160, easing: Easing.in(Easing.exp) };
    const settle = { damping: 12, stiffness: 380 };
    sx.value = withSequence(withDelay(140, withTiming(0.92, drop)), withDelay(hold, withTiming(1.08, { duration: 60 })), withSpring(1, settle));
    sy.value = withSequence(withDelay(140, withTiming(0.92, drop)), withDelay(hold, withTiming(0.92, { duration: 60 })), withSpring(1, settle));
    hit.value = withDelay(300, withTiming(1, { duration: 520, easing: Easing.out(Easing.quad) }));
    shake.value = withDelay(300, withSequence(
      withTiming(6, { duration: 30 }), withTiming(-5, { duration: 30 }), withTiming(3, { duration: 30 }), withTiming(0, { duration: 30 })));
    flash.value = withDelay(300, withSequence(withTiming(0.25, { duration: 16 }), withTiming(0, { duration: 120 })));
    dateIn.value = withDelay(460, withTiming(1, { duration: 150 }));
    if (hasShine(stamp)) { foil.value = 0; foil.value = withDelay(560, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })); }
    later(140, () => playSfx('fx.whoosh', 0.6));
    later(300, () => impact(celebrate));
  }, [reducedMotion, rank, stamp, fade, hit, sx, sy, lift, tilt, shake, flash, dateIn, foil, impact, later]);

  /** Quick re-press: claim moment and the re-stamp toy. */
  const repress = useCallback((sound: boolean) => {
    haptic('hitRigid');
    if (sound) playSfx('fx.hit', 0.8);
    if (reducedMotion) return;
    sx.value = withSequence(withTiming(0.94, { duration: 70 }), withSpring(1, { damping: 12, stiffness: 380 }));
    sy.value = withSequence(withTiming(0.94, { duration: 70 }), withSpring(1, { damping: 12, stiffness: 380 }));
    hit.value = 0.25; hit.value = withTiming(1, { duration: 420 });
  }, [reducedMotion, sx, sy, hit]);

  useEffect(() => {
    card.value = reducedMotion ? 1 : withSpring(1, { damping: 14, stiffness: 260 });
    if (stamp.earned && fresh) {
      slam(false);
    } else if (stamp.earned) {
      fade.value = withTiming(1, { duration: 120 });
      hit.value = 1;
      if (!reducedMotion) { sx.value = 0.9; sy.value = 0.9; sx.value = withSpring(1, { damping: 14 }); sy.value = withSpring(1, { damping: 14 }); }
      playSfx('ui.modalOpen', 0.5);
    } else {
      fade.value = withTiming(1, { duration: 180 });
      playSfx('ui.modalOpen', 0.5);
      if (!reducedMotion) breathe.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
    return () => { cancelAnimation(breathe); cancelAnimation(foil); };
    // Runs once per opened stamp (the body is keyed by stamp id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doClaim = useCallback(async () => {
    const ok = await onClaim();
    if (!ok) return;
    setClaimed(true);
    setCascading(true);
    repress(false);
    // Tokens pop, staggered.
    chipPop.value = 0;
    chipPop.value = withTiming(1, { duration: 520 });
    // Particles arc from each token to its HUD counter.
    const L = layout.current;
    const next: Burst[] = [];
    let n = 0;
    const kinds = rewardChips(stamp.rewards).map(c => c.kind as Kind).filter(k => HUD_KINDS.includes(k));
    kinds.forEach((kind, ki) => {
      const from = L.chips[kind]; const to = L.hud[kind];
      if (!from || !to || reducedMotion) return;
      const count = Math.min(8, Math.max(5, Math.round(16 / kinds.length)));
      for (let i = 0; i < count && n < 16; i++, n++) {
        next.push({ id: Date.now() + n, icon: KIND_ICON[kind], sx: L.chipsRow.x + from.x + (i % 3) * 6, sy: L.chipsRow.y + from.y,
          ex: L.hudRow.x + to.x, ey: L.hudRow.y + to.y, delay: 200 + ki * 90 + i * 45, lift: 70 + (i % 4) * 18 });
        later(200 + ki * 90 + i * 45 + 450, () => { haptic('tickSelection'); GameAudio.play('fx.coinTick', { pitch: Math.min(12, n), volume: 0.7 }); });
      }
    });
    setBursts(next);
    const land = reducedMotion ? 0 : 200 + kinds.length * 90 + 7 * 45 + 450;
    later(land, () => setShown(w => ({
      energy: w.energy + stamp.rewards.energy, tickets: w.tickets + stamp.rewards.tickets, xp: w.xp + stamp.rewards.xp,
    })));
    later(land + 420, () => { haptic('success'); playSfx('fx.reward'); setGotIt(true); });
    later(land + 1020, () => { setGotIt(false); setCascading(false); setBursts([]); });
  }, [onClaim, repress, chipPop, stamp, reducedMotion, later]);

  // Dev-only capture hook: EXPO_PUBLIC_STAMP_BOOK_AUTOCLAIM=1 claims after the slam, then follows the chain.
  const autoClaim = __DEV__ && process.env.EXPO_PUBLIC_STAMP_BOOK_AUTOCLAIM === '1';
  useEffect(() => {
    if (!autoClaim) return;
    if (stamp.earned && !claimed && hasRewards(stamp.rewards)) later(2200, () => { void doClaim(); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (autoClaim && claimed && !cascading && nextCount > 0) later(1200, onNext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cascading]);

  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: card.value }, { translateX: shake.value }] }));
  const artStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: lift.value }, { rotate: `${tilt.value}deg` }, { scaleX: sx.value }, { scaleY: sy.value }],
  }));
  const shadowStyle = useAnimatedStyle(() => ({ opacity: 0.18 + Math.max(0, -lift.value) * 0.02, transform: [{ scale: 0.8 + Math.max(0, -lift.value) * 0.02 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + 0.45 * breathe.value, transform: [{ scale: 0.92 + 0.08 * breathe.value }] }));
  const dateStyle = useAnimatedStyle(() => ({ opacity: dateIn.value }));

  const chips = rewardChips(stamp.rewards);
  const claimable = stamp.earned && !claimed && hasRewards(stamp.rewards);
  const goLabel = req.go ? 'Go!' : null;

  const onHudRow = (e: LayoutChangeEvent) => { layout.current.hudRow = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y }; };
  const onChipsRow = (e: LayoutChangeEvent) => { layout.current.chipsRow = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y }; };
  const at = (bucket: 'hud' | 'chips', kind: string) => (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    layout.current[bucket][kind] = { x: x + width / 2, y: y + height / 2 };
  };

  return (
    <View style={styles.backdrop} accessible={false}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} importantForAccessibility="no" />
      <Animated.View style={[styles.card, cardStyle]} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <View style={styles.lip} />
        <View style={[styles.body, legendary && styles.bodyLegendary]}>
          <View style={styles.ribbon}><Ribbon text={stamp.name} /></View>
          <Pressable onPress={onClose} hitSlop={14} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <GameIcon name="close" size={44} />
          </Pressable>

          {/* Mini HUD: where reward particles land. */}
          <View style={styles.hud} onLayout={onHudRow} accessible accessibilityLabel={`You have ${shown.energy} energy, ${shown.tickets} tickets, ${shown.xp} XP`}>
            {HUD_KINDS.map(kind => (
              <View key={kind} style={styles.hudItem} onLayout={at('hud', kind)}>
                <GameIcon name={KIND_ICON[kind]} size={18} />
                <Text style={styles.hudText} maxFontSizeMultiplier={1.2}>{shown[kind as keyof Wallet].toLocaleString('en-US')}</Text>
              </View>
            ))}
          </View>

          <Pressable
            style={styles.stage}
            onPress={stamp.earned ? () => repress(true) : undefined}
            accessibilityRole={stamp.earned ? 'button' : 'image'}
            accessibilityLabel={`${stamp.name} stamp, ${tone.label}${stamp.earned ? '. Tap to stamp it again' : ''}`}
          >
            {legendary && !reducedMotion && <Sunburst size={ART * 1.6} color="#FFD54A" running />}
            {stamp.earned && rank >= 3 && !reducedMotion && <RarityBurst size={ART * 1.3} color={tone.color} hit={hit} />}
            {stamp.earned && <InkBurst seed={stamp.id} size={ART} color={accent} hit={hit} />}
            {!stamp.earned && !stamp.secret && <Animated.View style={[styles.breathe, { backgroundColor: accent }, glowStyle]} />}
            <Animated.View style={[styles.shadow, shadowStyle]} />
            <Animated.View style={[styles.artBox, artStyle]}>
              {stamp.secret ? (
                <View style={[styles.secret, { borderColor: accent }]}><GameIcon name="info" size={ART * 0.4} /></View>
              ) : (
                <>
                  <StampArt stamp={stamp} size="full" priority="high" />
                  {bleed > 0 && (
                    <View style={[styles.bleed, { height: `${Math.round(bleed * 100)}%` }]}>
                      <View style={styles.bleedInner}><StampArt stamp={stamp} size="full" locked={false} /></View>
                    </View>
                  )}
                </>
              )}
              {hasShine(stamp) && !reducedMotion && <Foil stamp={stamp} size={ART} art="full" progress={foil} />}
            </Animated.View>
            <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />
          </Pressable>

          <View style={[styles.rarity, { backgroundColor: tone.color }]}>
            <Text style={styles.rarityText} maxFontSizeMultiplier={1.2}>{tone.label.toUpperCase()}</Text>
          </View>

          {stamp.earned ? (
            <Animated.Text style={[styles.earned, dateStyle]} maxFontSizeMultiplier={1.3}>
              {`Earned ${earnedDate(stamp.earnedAt) ?? ''}`.trim()}
            </Animated.Text>
          ) : (
            <Text style={styles.remaining} maxFontSizeMultiplier={1.3}>{remainingLine(stamp)}</Text>
          )}

          <View style={styles.howBox}>
            <View style={styles.howHead}>
              <GameIcon name={stamp.earned ? 'check' : req.icon} size={22} />
              {!stamp.earned && req.count !== null && <Text style={styles.howCount}>x{req.count.toLocaleString('en-US')}</Text>}
              <Text style={styles.howText} maxFontSizeMultiplier={1.3}>{stamp.howTo}</Text>
            </View>
            {!stamp.earned && !stamp.secret && (
              <View style={styles.bar}>
                <View style={[styles.barFill, { width: `${Math.max(4, stamp.percent)}%`, backgroundColor: accent }]} />
                <Text style={styles.barText} maxFontSizeMultiplier={1.2}>{progressLabel(stamp)}</Text>
              </View>
            )}
          </View>

          {chips.length > 0 && (
            <View style={styles.tokens} onLayout={onChipsRow}>
              {chips.map((chip, i) => (
                <Token key={chip.kind} kind={chip.kind} label={chip.label} done={claimed} pop={chipPop} index={i} onLayout={at('chips', chip.kind)} />
              ))}
            </View>
          )}

          <View style={styles.actions}>
            {claimable ? (
              <GameButton label={claiming ? 'Stamping...' : 'Claim!'} icon="gift" loading={claiming} onPress={doClaim}
                accessibilityLabel={`Claim rewards: ${rewardSpeech(stamp.rewards)}`} />
            ) : gotIt || cascading ? (
              <GameButton label={gotIt ? 'Got it!' : 'Stamped!'} icon="check" onPress={() => undefined} />
            ) : claimed && stamp.earned && nextCount > 0 ? (
              <GameButton label={`Next reward (${nextCount} left)`} icon="gift" onPress={onNext} />
            ) : !stamp.earned && goLabel && req.go ? (
              <GameButton label={goLabel} icon={req.icon} onPress={() => onGo(stamp)}
                accessibilityLabel={`Go. ${stamp.howTo}`} />
            ) : null}
            {stamp.earned && claimed && !cascading && !!stamp.rewards.title && (
              <GameButton label={equipping ? 'Saving...' : wearingTitle ? 'Remove title' : 'Wear title'} variant="secondary"
                icon="crown" loading={equipping} onPress={onToggleTitle} />
            )}
          </View>
          {!!message && <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>}

          {party && <Confetti width={340} height={620} seed={stamp.id} count={30} />}
          {bursts.map(b => <Particle key={b.id} icon={b.icon} sx={b.sx} sy={b.sy} ex={b.ex} ey={b.ey} delay={b.delay} lift={b.lift} />)}
        </View>
      </Animated.View>
    </View>
  );
}

function Token({ kind, label, done, pop, index, onLayout }: {
  kind: Kind; label: string; done: boolean; pop: SharedValue<number>; index: number; onLayout: (e: LayoutChangeEvent) => void;
}) {
  const style = useAnimatedStyle(() => {
    const t = Math.max(0, Math.min(1, (pop.value * 520 - index * 90) / 240));
    const s = t <= 0 || t >= 1 ? 1 : 1 + 0.25 * Math.sin(t * Math.PI);
    return { transform: [{ scale: s }] };
  });
  const amount = label.replace(/^\+/, '').split(' ')[0];
  return (
    <Animated.View style={[styles.token, style]} onLayout={onLayout} accessible accessibilityLabel={label.replace('+', 'plus ')}>
      <View style={styles.disc}><GameIcon name={KIND_ICON[kind]} size={24} /></View>
      <Text style={styles.tokenText} numberOfLines={1} maxFontSizeMultiplier={1.2}>{kind === 'title' ? 'Title' : `+${amount}`}</Text>
      {done && <View style={styles.tokenCheck}><GameIcon name="check" size={16} /></View>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(5,52,110,0.82)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  card: { width: '100%', maxWidth: 370, marginTop: 24 },
  lip: { position: 'absolute', left: 0, right: 0, top: 8, bottom: -7, borderRadius: 22, backgroundColor: '#045089' },
  body: { ...DIALOG_CARD, alignItems: 'center', paddingHorizontal: 18, paddingBottom: 18, paddingTop: 34 },
  bodyLegendary: { borderColor: '#FFD54A', borderWidth: 4 },
  ribbon: { position: 'absolute', top: -34, left: 18, right: 18, alignItems: 'center' },
  close: { position: 'absolute', top: -18, right: -14, zIndex: 5 },
  hud: { flexDirection: 'row', gap: 10, backgroundColor: 'rgba(0,40,90,0.45)', borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4, marginTop: 6 },
  hudItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hudText: { fontFamily: 'Shark', fontSize: 15, color: '#FFFFFF' },
  stage: { width: ART + 50, height: ART + 30, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  breathe: { position: 'absolute', width: ART * 0.95, height: ART * 0.95, borderRadius: ART },
  shadow: { position: 'absolute', bottom: 6, width: ART * 0.7, height: 18, borderRadius: 20, backgroundColor: '#022a55' },
  artBox: { width: ART, height: ART },
  bleed: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  bleedInner: { position: 'absolute', left: 0, right: 0, bottom: 0, height: ART },
  secret: { width: ART * 0.82, height: ART * 0.82, borderRadius: ART, borderWidth: 5, borderStyle: 'dashed', alignSelf: 'center', marginTop: ART * 0.09, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,207,59,0.15)' },
  flash: { ...StyleSheet.absoluteFillObject, backgroundColor: '#FFFFFF', borderRadius: 30 },
  rarity: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 3, borderWidth: 2, borderColor: '#FFFFFF' },
  rarityText: { fontFamily: 'Shark', fontSize: 14, color: '#FFFFFF', letterSpacing: 1 },
  earned: { fontFamily: 'Shark', fontSize: 18, color: '#FFFFFF', marginTop: 6, textShadowColor: '#05346e', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 },
  remaining: { fontFamily: 'Shark', fontSize: 22, color: '#FFCF3B', marginTop: 6, textShadowColor: '#05346e', textShadowOffset: { width: 1.5, height: 1.5 }, textShadowRadius: 0 },
  howBox: { width: '100%', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 16, padding: 12, marginTop: 10, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  howHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  howCount: { fontFamily: 'Shark', fontSize: 17, color: '#FFFFFF' },
  howText: { flex: 1, fontFamily: 'Knockout', fontSize: 18, lineHeight: 22, color: '#FFFFFF' },
  bar: { height: 20, borderRadius: 10, backgroundColor: 'rgba(0,20,60,0.55)', marginTop: 10, overflow: 'hidden', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.5)' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 9 },
  barText: { fontFamily: 'Shark', fontSize: 14, color: '#FFFFFF', textAlign: 'center', textShadowColor: '#05346e', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 },
  tokens: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 12 },
  token: { alignItems: 'center', minWidth: 58 },
  disc: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFF8E4', borderWidth: 3, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center', shadowColor: '#022a55', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.4, shadowRadius: 0,
  },
  tokenText: { fontFamily: 'Shark', fontSize: 16, color: '#FFFFFF', marginTop: 2, textShadowColor: '#05346e', textShadowOffset: { width: 1.5, height: 1.5 }, textShadowRadius: 0 },
  tokenCheck: { position: 'absolute', top: -4, right: 2 },
  actions: { alignSelf: 'stretch', gap: 8, marginTop: 14, alignItems: 'center' },
  message: { fontFamily: 'Knockout', fontSize: 15, color: '#E2F6FF', textAlign: 'center', marginTop: 8 },
});
