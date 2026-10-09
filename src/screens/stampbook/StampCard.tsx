/**
 * The big stamp card, built like Alex's popups: the blue modal card with a
 * white rim and chunky lip, the gold ribbon title, his round X, glossy reward
 * tokens and his yellow button.
 *
 * Staging: the Modal itself does not animate. The card owns a 120 ms backdrop
 * fade, and the slam starts only once the 768 px art has loaded (thumb shown
 * as its placeholder) or 350 ms have passed, so the anticipation is never
 * hidden inside a fade or played over an empty frame.
 *
 * Earned, first view: hover, exp drop, hit-stop, squash, one-overshoot settle,
 * navy ink blot and droplets, shake, flash; one layered thunk and a rigid
 * haptic on the impact frame (predicted timer). Rare and up add a colour burst;
 * legendary adds the gold sunburst, holo foil, confetti and a longer hit-stop.
 * Earned, repeat view: a pop-in plus one foil sweep for rare and up; tap the
 * stamp to re-stamp it.
 * Claim: instant re-press, token pop and haptic before the server answers;
 * then particles arc into the HUD with rising ticks and the HUD counts up per
 * landing; "Got it!" status, then "Next reward (n left)". On failure the
 * tokens shake. The action button is mounted once per card (outside the
 * per-stamp content), so chained cards never flash an empty button.
 * Locked: ghost art in a dashed ring with a lock, breathing in the section
 * colour; colour bleeds up from an ink line past 75% (capped at 65%).
 * Reduce Motion: fades only; sound, haptics and announcements stay.
 */
import { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { AccessibilityInfo, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent } from 'react-native';
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
import { RARITY_INK, stampRarity } from './rarity';
import GameIcon from '../../ui/GameIcon';
import GameButton from '../../ui/GameButton';
import Ribbon from '../../components/Ribbon';
import { DIALOG_CARD } from '../../ui/GameDialog';
import type { GameIconName } from '../../ui/iconNames';
import StampArt from './StampArt';
import Foil from './Foil';
import { Confetti, InkBurst, InkEdge, Particle, RarityBurst, SoftShadow, Sunburst } from './SlamFx';
import {
  bleedFraction, earnedDate, hasRewards, hasShine, progressLabel, rarityRank, remainingLine, requirement, rewardChips, rewardSpeech, whereFor,
  type BookStamp, type Where,
} from './model';

const ART = 220;
const STAGE_H = ART + 30 + 4;
/** 1 on tall phones (900 pt and up); down to 0.42 on a 667 pt iPhone SE so the card never clips. */
export function stageScaleFor(screenH: number): number {
  if (screenH >= 900) return 1;
  return Math.max(0.42, Math.min(1, (screenH - 560) / 340));
}
/** Badge centre inside the art canvas (plates are normalised a little below centre). */
const BADGE_CY = 0.55;
const INK = '#14213D';
const LEGENDARY_GOLD = '#FFC21A';
type Kind = 'energy' | 'tickets' | 'xp' | 'coins' | 'title';
type HudKind = 'energy' | 'tickets' | 'xp' | 'coins';
const KIND_ICON: Record<Kind, GameIconName> = { energy: 'energy', tickets: 'ticket', xp: 'xp', coins: 'coin', title: 'crown' };
const BASE_HUD: HudKind[] = ['energy', 'tickets', 'xp'];

/** Coin stamps (and coin rewards) also show the coin balance in the card HUD. */
export function hudKinds(stamp: Pick<BookStamp, 'metric' | 'rewards'>): HudKind[] {
  const coins = stamp.metric === 'coins_held' || stamp.metric === 'coins_earned' || (stamp.rewards?.coins ?? 0) > 0;
  return coins ? [...BASE_HUD, 'coins'] : BASE_HUD;
}

export interface Wallet { energy: number; tickets: number; xp: number; coins: number }

/** What a claim returned: success, and what the XP did to the player's level (stamp-economy backend). */
export interface ClaimResult { ok: boolean; levelsGained?: number; level?: number | null }

interface Burst { id: string; icon: GameIconName; sx: number; sy: number; ex: number; ey: number; delay: number; lift: number }

/** The card-wide HUD the chained stamp content talks to (lives in Frame, so it never remounts). */
interface HudBus {
  readonly layout: { current: { hud: Record<string, { x: number; y: number }>; hudRow: { x: number; y: number }; content: { x: number; y: number } } };
  readonly add: (kind: HudKind, n: number) => void;
  readonly burst: (list: Burst[]) => void;
  readonly setCascading: (on: boolean) => void;
  readonly levelUp: (level: number) => void;
}

type Phase = 'idle' | 'claiming' | 'cascading' | 'gotIt';

interface Props {
  readonly stamp: BookStamp | null;
  readonly accent: string;
  readonly reducedMotion: boolean;
  /** First view after earning: the full slam. Repeat views get a pop-in. */
  readonly fresh: boolean;
  readonly wallet: Wallet;
  readonly equipping: boolean;
  readonly message: string | null;
  readonly wearingTitle: boolean;
  /** Claimable stamps left after this one (the chain). */
  readonly nextCount: number;
  /** The stamp the Next button will open: its art is prefetched during the cascade. */
  readonly nextStamp?: BookStamp | null;
  readonly onClaim: () => Promise<ClaimResult>;
  readonly onNext: () => void;
  readonly onGo: (stamp: BookStamp) => void;
  readonly onToggleTitle: () => void;
  readonly onClose: () => void;
}

export default function StampCard(props: Props) {
  return (
    <Modal visible={!!props.stamp} transparent animationType="none" onRequestClose={props.onClose} statusBarTranslucent>
      {props.stamp && <Frame {...props} stamp={props.stamp} />}
    </Modal>
  );
}

interface ContentHandle { claim: () => void }

/** Mounted once per open: backdrop, card chrome and the action button survive chained stamps. */
function Frame(props: Props & { stamp: BookStamp }) {
  const { stamp, reducedMotion, equipping, message, wearingTitle, nextCount, nextStamp, wallet, onNext, onGo, onToggleTitle, onClose } = props;
  const backdrop = useSharedValue(reducedMotion ? 1 : 0);
  const card = useSharedValue(reducedMotion ? 1 : 0.9);
  const shake = useSharedValue(0);
  const content = useRef<ContentHandle>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [claimedIds, setClaimedIds] = useState<number[]>([]);

  // HUD lives here (not in the per-stamp Content) so its icons and numbers never remount on a chained card.
  const cascadingRef = useRef(false);
  const [shown, setShown] = useState<Wallet>(wallet);
  // A chained card opens before the profile refresh lands: follow the wallet whenever nothing is counting.
  useEffect(() => { if (!cascadingRef.current) setShown(wallet); }, [wallet]);
  const [bursts, setBursts] = useState<Burst[]>([]);
  const [levelUp, setLevelUp] = useState<number | null>(null);
  const hudLayout = useRef({ hud: {} as Record<string, { x: number; y: number }>, hudRow: { x: 0, y: 0 }, content: { x: 0, y: 0 } });
  const bus = useMemo<HudBus>(() => ({
    layout: hudLayout,
    add: (kind, n) => setShown(w => ({ ...w, [kind]: w[kind] + n })),
    burst: list => setBursts(list),
    setCascading: on => { cascadingRef.current = on; },
    levelUp: level => setLevelUp(level),
  }), []);
  const kinds = hudKinds(stamp);

  // The stamp shown before this one, held on top until the new art is drawn (see the content block below).
  // Derived during render (not in an effect), so the outgoing Content is never unmounted for even one commit.
  const [current, setCurrent] = useState(stamp);
  const [held, setHeld] = useState<BookStamp | null>(null);
  if (current.id !== stamp.id) {
    setHeld(current);
    setCurrent(stamp);
  }
  useEffect(() => {
    if (!held) return;
    const cap = setTimeout(() => setHeld(null), 700);
    return () => clearTimeout(cap);
  }, [held]);
  const release = useCallback(() => { requestAnimationFrame(() => setHeld(null)); }, []);

  // Prefetch the next stamp's art while this one cascades, so the hand-off never opens on an empty stage.
  useEffect(() => {
    if (phase !== 'cascading' || !nextStamp) return;
    const urls = [nextStamp.thumbUrl, nextStamp.iconUrl, nextStamp.lockedThumbUrl].filter((u): u is string => !!u);
    if (urls.length) Image.prefetch(urls, 'memory-disk').catch(() => undefined);
  }, [phase, nextStamp]);

  useEffect(() => {
    if (reducedMotion) return;
    backdrop.value = withTiming(1, { duration: 120 });
    card.value = withSpring(1, { damping: 16, stiffness: 300 });
  }, [backdrop, card, reducedMotion]);
  // Before paint, so a chained card never shows the previous card's "Got it!".
  useLayoutEffect(() => { setPhase('idle'); }, [stamp.id]);

  const claimed = stamp.rewardClaimed || claimedIds.includes(stamp.id);
  const req = requirement(stamp);
  const claimable = stamp.earned && !claimed && hasRewards(stamp.rewards);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const cardStyle = useAnimatedStyle(() => ({ opacity: backdrop.value, transform: [{ scale: card.value }, { translateX: shake.value }] }));

  // One button, always mounted while it has a job; only its label and action change.
  const busy = phase === 'claiming' || phase === 'cascading' || phase === 'gotIt';
  let action: { label: string; icon: GameIconName; onPress: () => void; a11y: string } | null = null;
  // A claimed title stamp: wearing the title is the main job, the claim chain moves to the second button.
  const titleReady = !!stamp.rewards.title && stamp.earned && claimed && !stamp.secret;
  const wearFirst = titleReady && !wearingTitle;
  if (claimable || phase === 'claiming') action = { label: 'Claim!', icon: 'gift', onPress: () => content.current?.claim(), a11y: `Claim rewards: ${rewardSpeech(stamp.rewards)}` };
  else if (wearFirst) action = { label: equipping ? 'Saving...' : 'Wear title', icon: 'crown', onPress: onToggleTitle, a11y: `Wear the title ${stamp.rewards.title}` };
  else if (claimed && stamp.earned && nextCount > 0) action = { label: `Next reward (${nextCount} left)`, icon: 'gift', onPress: onNext, a11y: `Next reward, ${nextCount} left` };
  else if (!stamp.earned && req.go) action = { label: 'Go!', icon: req.icon, onPress: () => onGo(stamp), a11y: `Go. ${stamp.howTo}` };
  const status = phase === 'gotIt' ? 'Got it!' : phase === 'cascading' ? 'Stamped!' : claimed && stamp.earned && !action ? 'Stamped!' : null;

  // While the outgoing stamp is held on top, every part of the card shows THAT stamp (title, frame,
  // button), so nothing mixes two stamps for even one frame.
  const holding = !!held && held.id !== stamp.id;
  const display = holding ? (held as BookStamp) : stamp;
  const displayLegendary = display.earned && display.rarity === 'legendary';
  if (holding) action = { label: `Next reward (${nextCount + 1} left)`, icon: 'gift', onPress: noop, a11y: `Next reward, ${nextCount + 1} left` };
  const shownStatus = holding ? null : status;
  const displayClaimed = display.rewardClaimed || claimedIds.includes(display.id);

  return (
    <View style={styles.root} accessible={false}>
      <Animated.View style={[styles.backdrop, backdropStyle]} />
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} importantForAccessibility="no" />
      <Animated.View style={[styles.card, cardStyle]} accessibilityViewIsModal onAccessibilityEscape={onClose}>
        <View style={styles.lip} />
        <View style={[styles.body, displayLegendary && styles.bodyLegendary]}>
          <View style={styles.ribbon}><Ribbon text={display.name} /></View>
          <Pressable onPress={onClose} hitSlop={14} style={styles.close} accessibilityRole="button" accessibilityLabel="Close">
            <GameIcon name="close" size={44} />
          </Pressable>

          {/* Mini HUD: where reward particles land. Outside the keyed Content, so it survives the chain. */}
          <View style={styles.hud} onLayout={e => { hudLayout.current.hudRow = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y }; }}
            accessible accessibilityLabel={`You have ${kinds.map(k => `${shown[k]} ${k === 'xp' ? 'XP' : k}`).join(', ')}`}>
            {kinds.map(kind => (
              <View key={kind} style={styles.hudItem} onLayout={e => {
                const { x, y, width, height } = e.nativeEvent.layout;
                hudLayout.current.hud[kind] = { x: x + width / 2, y: y + height / 2 };
              }}>
                <GameIcon name={KIND_ICON[kind]} size={22} />
                <Text style={styles.hudText} maxFontSizeMultiplier={1.2}>{shown[kind].toLocaleString('en-US')}</Text>
              </View>
            ))}
          </View>

          <View style={styles.contentWrap} onLayout={e => { hudLayout.current.content = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y }; }}>
            {/* Hand-off: the outgoing stamp stays mounted on top until the incoming art is actually drawn
                (onDisplay, capped), so a chained card never shows an empty stage for even one frame. */}
            {[stamp, ...(held && held.id !== stamp.id ? [held] : [])].map(s => (
              <Content key={s.id} ref={s.id === stamp.id ? content : undefined} {...props} stamp={s}
                claimed={s.rewardClaimed || claimedIds.includes(s.id)} shake={shake} bus={bus} overlay={s.id !== stamp.id}
                onShown={s.id === stamp.id ? release : undefined}
                onPhase={s.id === stamp.id ? setPhase : noop} onClaimed={id => setClaimedIds(ids => [...ids, id])} />
            ))}
          </View>

          <View style={styles.actions}>
            {(action || shownStatus) && (
              <View style={styles.actionSlot}>
                <View style={shownStatus ? styles.hidden : undefined} importantForAccessibility={shownStatus ? 'no-hide-descendants' : 'auto'}
                  accessibilityElementsHidden={!!shownStatus} pointerEvents={shownStatus || holding ? 'none' : 'auto'}>
                  {/* While the claim is in flight the button stays yellow (no olive disabled look); presses are ignored. */}
                  {/* In flight: GameButton's `loading` keeps the yellow art, pulses the label, ignores taps silently and reports busy. */}
                  <GameButton label={phase === 'claiming' ? 'Stamping...' : action?.label ?? 'Stamped!'} icon={action?.icon ?? 'check'}
                    loading={phase === 'claiming'} disabled={!action || phase === 'cascading' || phase === 'gotIt'}
                    onPress={busy ? undefined : action?.onPress}
                    accessibilityLabel={action?.a11y} />
                </View>
                {!!shownStatus && (
                  <View style={styles.status} accessible accessibilityRole="text" accessibilityLabel={shownStatus}>
                    <GameIcon name="check" size={26} />
                    <Text style={styles.statusText} maxFontSizeMultiplier={1.2}>{shownStatus}</Text>
                  </View>
                )}
              </View>
            )}
            {/* Second button, mounted (invisible) as soon as the stamp has a title so its art is measured before it shows:
                a freshly mounted GameButton otherwise flashes one frame of blank art. Wearing the title first: the claim chain;
                already wearing it: a quiet Take off. */}
            {!!display.rewards.title && display.earned && (
              <View style={!(displayClaimed && !busy) && styles.hidden} pointerEvents={displayClaimed && !busy && !holding ? 'auto' : 'none'}
                importantForAccessibility={displayClaimed && !busy ? 'auto' : 'no-hide-descendants'} accessibilityElementsHidden={!(displayClaimed && !busy)}>
                {wearFirst ? (
                  nextCount > 0 ? <GameButton label={`Next reward (${nextCount} left)`} variant="secondary" icon="gift" onPress={onNext} /> : null
                ) : (
                  <GameButton label={equipping ? 'Saving...' : wearingTitle ? 'Take off title' : 'Wear title'} variant={wearingTitle ? 'ghost' : 'secondary'}
                    tone="onBlue" icon="crown" loading={equipping} onPress={onToggleTitle} />
                )}
              </View>
            )}
          </View>
          {!!message && <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text>}
              {bursts.map(b => <Particle key={b.id} icon={b.icon} sx={b.sx} sy={b.sy} ex={b.ex} ey={b.ey} delay={b.delay} lift={b.lift} />)}
          {levelUp !== null && <LevelUp level={levelUp} reducedMotion={reducedMotion} onDone={() => setLevelUp(null)} />}
          {/* Keeps the reward icons decoded for the whole chain, so token discs are never blank on a new card. */}
          <View style={styles.preload} pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
            {(['energy', 'ticket', 'xp', 'coin', 'crown', 'check', 'gift'] as GameIconName[]).map(n => <GameIcon key={n} name={n} size={8} />)}
          </View>
        </View>
      </Animated.View>
    </View>
  );
}

const noop = () => undefined;

type ContentProps = Props & {
  bus: HudBus;
  /** The outgoing stamp during a hand-off: drawn on top, inert. */
  overlay?: boolean;
  /** The incoming stamp's art is on screen. */
  onShown?: () => void;
  stamp: BookStamp;
  claimed: boolean;
  shake: SharedValue<number>;
  onPhase: (p: Phase) => void;
  onClaimed: (id: number) => void;
};

const Content = forwardRef<ContentHandle, ContentProps>(function Content({ stamp, accent, reducedMotion, fresh, claimed,
  shake, nextCount, bus, overlay, wearingTitle, onShown, onClaim, onNext, onPhase, onClaimed }, ref) {
  const tone = stampRarity(stamp.rarity);
  const rank = rarityRank(stamp.rarity);
  // Small phones (iPhone SE): the art stage shrinks so the whole card fits under the status bar and above the home bar.
  const { height: screenH } = useWindowDimensions();
  const stageScale = stageScaleFor(screenH);
  const legendary = stamp.earned && stamp.rarity === 'legendary';
  const req = requirement(stamp);
  const bleed = bleedFraction(stamp);

  const flash = useSharedValue(0);
  // A fresh slam starts in its hover pose with the thumb visible, so the hold before the drop is never an empty stage.
  const hover = stamp.earned && fresh && !reducedMotion;
  const sx = useSharedValue(hover ? 1.35 : 1);
  const sy = useSharedValue(hover ? 1.35 : 1);
  const lift = useSharedValue(hover ? -6 : 0);
  const tilt = useSharedValue(hover ? -12 : stamp.earned ? -3 : 0);
  // Visible from the first frame: the cached thumb stands in until the big art arrives (never an empty stage).
  const fade = useSharedValue(1);
  const hit = useSharedValue(0);
  const foil = useSharedValue(0);
  const breathe = useSharedValue(0);
  const dateIn = useSharedValue(stamp.earned && !fresh ? 1 : 0);
  const tokenShake = useSharedValue(0);
  const chipPop = useSharedValue(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const later = useCallback((ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); }, []);
  useEffect(() => () => { timers.current.forEach(clearTimeout); timers.current = []; }, []);

  const [party, setParty] = useState(false);
  const layout = useRef<{ chips: Record<string, { x: number; y: number }>; chipsRow: { x: number; y: number } }>({ chips: {}, chipsRow: { x: 0, y: 0 } });

  const impact = useCallback((celebrate: boolean) => {
    haptic('hitRigid');
    playSfx('fx.hit');
    later(80, () => playSfx('ui.confirm', 0.7));
    if (rank >= 5) later(260, () => { playSfx('fx.reveal'); later(320, () => playSfx('fx.coinFull', 0.5)); });
    else if (rank >= 3) later(220, () => playSfx('fx.reveal', 0.85));
    if (celebrate) later(150, () => { haptic('success'); playSfx('fx.reward'); });
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
    hit.value = 0;
    sx.value = 1.35; sy.value = 1.35; lift.value = -6; tilt.value = -12;
    fade.value = withTiming(1, { duration: 80 });
    lift.value = withSequence(withTiming(-12, { duration: 140, easing: Easing.out(Easing.quad) }), withTiming(0, { duration: 160, easing: Easing.in(Easing.exp) }));
    tilt.value = withDelay(140, withTiming(-3, { duration: 160, easing: Easing.in(Easing.exp) }));
    const drop = { duration: 160, easing: Easing.in(Easing.exp) };
    const settle = { damping: 20, stiffness: 380 };
    sx.value = withSequence(withDelay(140, withTiming(0.92, drop)), withDelay(hold, withTiming(1.08, { duration: 60 })), withSpring(1, settle));
    sy.value = withSequence(withDelay(140, withTiming(0.92, drop)), withDelay(hold, withTiming(0.92, { duration: 60 })), withSpring(1, settle));
    hit.value = withDelay(300, withTiming(1, { duration: 1200, easing: Easing.linear }));
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
    sx.value = withSequence(withTiming(0.94, { duration: 70 }), withSpring(1, { damping: 20, stiffness: 380 }));
    sy.value = withSequence(withTiming(0.94, { duration: 70 }), withSpring(1, { damping: 20, stiffness: 380 }));
    hit.value = 0.25; hit.value = withTiming(1, { duration: 420 });
  }, [reducedMotion, sx, sy, hit]);

  // Open: hold the slam until the big art is ready (or 350 ms), so the drop never plays over an empty frame.
  const started = useRef(false);
  const start = useCallback(() => {
    if (started.current) return;
    started.current = true;
    if (stamp.earned && fresh) {
      slam(false);
    } else if (stamp.earned) {
      fade.value = withTiming(1, { duration: 120 });
      hit.value = 1;
      if (!reducedMotion) {
        sx.value = 0.9; sy.value = 0.9; sx.value = withSpring(1, { damping: 16 }); sy.value = withSpring(1, { damping: 16 });
        if (hasShine(stamp)) { foil.value = 0; foil.value = withDelay(300, withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) })); }
      }
      playSfx('ui.modalOpen', 0.5);
    } else {
      fade.value = withTiming(1, { duration: 180 });
      playSfx('ui.modalOpen', 0.5);
      if (!reducedMotion) breathe.value = withRepeat(withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.sin) }), -1, true);
    }
  }, [stamp, fresh, slam, fade, hit, sx, sy, foil, breathe, reducedMotion]);
  useEffect(() => {
    later(350, start);
    return () => { cancelAnimation(breathe); cancelAnimation(foil); };
    // Runs once per opened stamp (Content is keyed by stamp id).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const onArtReady = useCallback(() => { later(120, start); }, [later, start]);

  const claim = useCallback(async () => {
    // Instant feedback before the network: press, pop, haptic.
    onPhase('claiming');
    repress(false);
    chipPop.value = 0;
    chipPop.value = withTiming(1, { duration: 520 });
    const result = await onClaim();
    if (!result.ok) {
      onPhase('idle');
      haptic('warning');
      tokenShake.value = withSequence(withTiming(8, { duration: 50 }), withTiming(-8, { duration: 50 }), withTiming(5, { duration: 50 }), withTiming(0, { duration: 50 }));
      return;
    }
    onClaimed(stamp.id);
    bus.setCascading(true);
    onPhase('cascading');
    // Particles arc from each token to its HUD counter; each landing ticks the counter up.
    const L = layout.current;
    const H = bus.layout.current;
    const cx0 = H.content.x + L.chipsRow.x; const cy0 = H.content.y + L.chipsRow.y;
    const next: Burst[] = [];
    let n = 0;
    let lastLanding = 0;
    const hud = hudKinds(stamp);
    const kinds = rewardChips(stamp.rewards).map(c => c.kind).filter((k): k is HudKind => (hud as string[]).includes(k));
    kinds.forEach((kind, ki) => {
      const total = stamp.rewards[kind];
      const from = L.chips[kind]; const to = H.hud[kind];
      if (!from || !to || reducedMotion) {
        bus.add(kind, total);
        return;
      }
      const count = Math.min(8, Math.max(5, Math.round(16 / kinds.length)));
      let given = 0;
      for (let i = 0; i < count && n < 16; i++, n++) {
        const step = n;
        const share = i === count - 1 ? total - given : Math.floor(total / count);
        given += share;
        const delay = 200 + ki * 90 + i * 45;
        next.push({ id: `${stamp.id}-${step}`, icon: KIND_ICON[kind], sx: cx0 + from.x + (i % 3) * 6, sy: cy0 + from.y,
          ex: H.hudRow.x + to.x, ey: H.hudRow.y + to.y, delay, lift: 70 + (i % 4) * 18 });
        lastLanding = Math.max(lastLanding, delay + 450);
        later(delay + 450, () => {
          haptic('tickSelection');
          GameAudio.play('fx.coinTick', { pitch: Math.min(12, step), volume: 0.7 });
          bus.add(kind, share);
        });
      }
    });
    bus.burst(next);
    const spoken = rewardChips(stamp.rewards).map(c => c.label.replace('+', '')).join(', ');
    const levelled = (result.levelsGained ?? 0) > 0 && typeof result.level === 'number';
    later(lastLanding + 200, () => {
      haptic('success'); playSfx('fx.reward'); onPhase('gotIt');
      AccessibilityInfo.announceForAccessibility(`Got ${spoken}${levelled ? `. Level up! You are level ${result.level}` : ''}`);
    });
    // The XP moved the level bar: play the level-up moment after the rewards land.
    if (levelled) later(lastLanding + 650, () => bus.levelUp(result.level as number));
    later(lastLanding + (levelled ? 2400 : 800), () => { bus.setCascading(false); onPhase('idle'); bus.burst([]); });
  }, [onPhase, onClaim, onClaimed, repress, chipPop, tokenShake, stamp, reducedMotion, later, bus]);

  useImperativeHandle(ref, () => ({ claim: () => { void claim(); } }), [claim]);

  // Dev-only capture hook: EXPO_PUBLIC_STAMP_BOOK_AUTOCLAIM=1 claims after the slam, then follows the chain.
  const autoClaim = __DEV__ && process.env.EXPO_PUBLIC_STAMP_BOOK_AUTOCLAIM === '1';
  useEffect(() => {
    if (!autoClaim) return;
    if (stamp.earned && !claimed && hasRewards(stamp.rewards)) later(2400, () => { void claim(); });
    // Waits out the cascade and any level-up moment before following the chain.
    else if (claimed && nextCount > 0) later(3400, onNext);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claimed]);

  const artStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: lift.value }, { rotate: `${tilt.value}deg` }, { scaleX: sx.value }, { scaleY: sy.value }],
  }));
  // Soft ground shadow: grows while the stamp hovers, gone once it lands.
  const shadowStyle = useAnimatedStyle(() => ({ opacity: Math.max(0, -lift.value) / 12, transform: [{ scaleX: 0.8 + Math.max(0, -lift.value) * 0.02 }] }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flash.value }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.25 + 0.45 * breathe.value, transform: [{ scale: 0.92 + 0.08 * breathe.value }] }));
  const dateStyle = useAnimatedStyle(() => ({ opacity: dateIn.value }));
  const tokensStyle = useAnimatedStyle(() => ({ transform: [{ translateX: tokenShake.value }] }));

  const chips = rewardChips(stamp.rewards);
  const onChipsRow = (e: LayoutChangeEvent) => { layout.current.chipsRow = { x: e.nativeEvent.layout.x, y: e.nativeEvent.layout.y }; };
  const at = (_bucket: 'chips', kind: string) => (e: LayoutChangeEvent) => {
    const { x, y, width, height } = e.nativeEvent.layout;
    layout.current.chips[kind] = { x: x + width / 2, y: y + height / 2 };
  };
  const pillGold = rank >= 5;

  return (
    <View collapsable={false} style={[styles.content, overlay && styles.overlay]} pointerEvents={overlay ? 'none' : 'auto'}
      importantForAccessibility={overlay ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={overlay}>
      <View style={{ height: STAGE_H * stageScale, marginVertical: 0, alignItems: 'center', justifyContent: 'center' }}>
      <Pressable
        style={[styles.stage, stageScale < 1 && { transform: [{ scale: stageScale }] }]}
        onPress={stamp.earned ? () => repress(true) : undefined}
        accessibilityRole={stamp.earned ? 'button' : 'image'}
        accessibilityLabel={`${stamp.name} stamp, ${tone.label}${stamp.earned ? '. Tap to stamp it again' : '. Locked'}`}
      >
        {legendary && !reducedMotion && <Sunburst size={ART * 1.6} color={LEGENDARY_GOLD} running />}
        {stamp.earned && rank >= 3 && !reducedMotion && <RarityBurst size={ART * 1.3} color={tone.frame} hit={hit} />}
        {stamp.earned && <InkBurst seed={stamp.id} size={ART} color={INK} hit={hit} />}
        {!stamp.earned && !stamp.secret && <Animated.View style={[styles.breathe, { borderColor: accent }, glowStyle]} />}
        <Animated.View style={[styles.shadow, shadowStyle]}><SoftShadow width={ART * 0.62} height={26} /></Animated.View>
        <Animated.View style={[styles.artBox, artStyle]}>
          {stamp.secret ? (
            <View style={[styles.secret, { borderColor: accent }]}><GameIcon name="info" size={ART * 0.4} /></View>
          ) : (
            <>
              <StampArt stamp={stamp} size="full" priority="high" onReady={onArtReady} onShown={onShown} transition={0} />
              {bleed > 0 && (
                <View style={[styles.bleed, { height: `${Math.round(bleed * 100)}%` }]}>
                  <View style={styles.bleedInner}><StampArt stamp={stamp} size="full" locked={false} /></View>
                  <View style={styles.inkEdge}><InkEdge width={ART * 0.68} color={INK} /></View>
                </View>
              )}
            </>
          )}
          {hasShine(stamp) && !reducedMotion && <Foil stamp={stamp} size={ART} art="full" progress={foil} />}
          {!stamp.earned && !stamp.secret && (
            <>
              <View pointerEvents="none" style={[styles.stampHere, { borderColor: accent }]} />
              <View style={styles.lock}><GameIcon name="lock" size={22} /></View>
            </>
          )}
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />
      </Pressable>
      </View>

      {/* App-wide ramp (rarity.ts): light chip, rarity frame, navy ink; gold is Legendary only. */}
      <View style={[styles.rarity, { backgroundColor: tone.chip, borderColor: tone.frame }, pillGold && styles.rarityGold]}>
        <Text style={styles.rarityText} maxFontSizeMultiplier={1.2}>{tone.label.toUpperCase()}</Text>
      </View>

      {stamp.earned ? (
        <Animated.Text style={[styles.earned, dateStyle]} maxFontSizeMultiplier={1.3}>
          {`Earned ${earnedDate(stamp.earnedAt) ?? ''}`.trim()}
        </Animated.Text>
      ) : (
        <View style={styles.remainingRow}>
          {!stamp.secret && <GameIcon name={req.icon} size={26} />}
          <Text style={styles.remaining} maxFontSizeMultiplier={1.3}>{remainingLine(stamp)}</Text>
        </View>
      )}

      <View style={styles.howBox}>
        <View style={styles.howHead}>
          <GameIcon name={stamp.earned ? 'check' : stamp.secret ? 'sparkle' : req.icon} size={22} />
          {!stamp.earned && !stamp.secret && req.count !== null && <Text style={styles.howCount}>x{req.count.toLocaleString('en-US')}</Text>}
          <Text style={styles.howText} maxFontSizeMultiplier={1.3}>{stamp.howTo}</Text>
          {!stamp.earned && !stamp.secret && <WhereChip where={whereFor(stamp.metric)} />}
        </View>
        {!stamp.earned && !stamp.secret && (
          <View style={styles.bar}>
            <View style={[styles.barFill, { width: `${Math.max(4, stamp.percent)}%`, backgroundColor: accent }]} />
            <Text style={styles.barText} maxFontSizeMultiplier={1.2}>{progressLabel(stamp)}</Text>
          </View>
        )}
      </View>

      {!!stamp.rewards.title && !stamp.secret && (
        <TitleBox title={stamp.rewards.title} state={!stamp.earned ? 'locked' : !claimed ? 'claim' : wearingTitle ? 'wearing' : 'ready'} />
      )}

      {chips.length > 0 && (
        <Animated.View style={[styles.tokens, tokensStyle]} onLayout={onChipsRow}>
          {chips.map((chip, i) => (
            <Token key={chip.kind} kind={chip.kind} label={chip.label} done={claimed} pop={chipPop} index={i} onLayout={at('chips', chip.kind)} />
          ))}
        </Animated.View>
      )}

      {party && <Confetti width={340} height={620} seed={stamp.id} count={30} />}
    </View>
  );
});

/** Where you earn it: in a park, or anywhere (home, friends, streaks). */
function WhereChip({ where }: { where: Where }) {
  return (
    <View style={styles.where} accessible accessibilityLabel={where === 'park' ? 'At a park' : 'Anywhere'}>
      <GameIcon name={where === 'park' ? 'map' : 'shark'} size={16} />
      <Text style={styles.whereText} maxFontSizeMultiplier={1.2}>{where === 'park' ? 'At a park' : 'Anywhere'}</Text>
    </View>
  );
}

/** The title this stamp gives, as it reads under your shark, with one line on how to get or wear it. */
function TitleBox({ title, state }: { title: string; state: 'locked' | 'claim' | 'ready' | 'wearing' }) {
  // Unlock and wear moments: the pill pops (UI thread) with a sparkle sound when the title becomes yours or goes on.
  const pop = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    if (state !== 'ready' && state !== 'wearing') return;
    playSfx(state === 'ready' ? 'fx.reveal' : 'fx.reward', 0.8);
    haptic('success');
    pop.value = withSequence(withTiming(1.22, { duration: 140, easing: Easing.out(Easing.quad) }), withSpring(1, { damping: 9, stiffness: 260 }));
  }, [state, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const line = state === 'wearing' ? 'On your profile now!' : state === 'ready' ? 'Yours! Wear it on your profile' : state === 'claim' ? 'Claim to unlock this title' : 'Earn this stamp to unlock';
  const owned = state === 'ready' || state === 'wearing';
  return (
    <View style={[styles.titleBox, owned && styles.titleBoxOwned]} accessible accessibilityLabel={`Title: ${title}. ${line}`}>
      <Animated.View style={[styles.titlePill, !owned && styles.titlePillLocked, popStyle]}>
        <GameIcon name="crown" size={20} />
        <Text style={[styles.titlePillText, !owned && styles.titlePillTextLocked]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}
          maxFontSizeMultiplier={1.2}>{title}</Text>
      </Animated.View>
      <Text style={styles.titleLine} numberOfLines={2} maxFontSizeMultiplier={1.2}>{line}</Text>
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
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 18 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,52,110,0.82)' },
  card: { width: '100%', maxWidth: 370, marginTop: 24 },
  lip: { position: 'absolute', left: 0, right: 0, top: 8, bottom: -7, borderRadius: 22, backgroundColor: '#045089' },
  body: { ...DIALOG_CARD, alignItems: 'center', paddingHorizontal: 18, paddingBottom: 18, paddingTop: 34 },
  bodyLegendary: { borderColor: LEGENDARY_GOLD, borderWidth: 4 },
  ribbon: { position: 'absolute', top: -34, left: 18, right: 18, alignItems: 'center' },
  close: { position: 'absolute', top: -18, right: -14, zIndex: 5 },
  content: { alignSelf: 'stretch', alignItems: 'center' },
  contentWrap: { alignSelf: 'stretch' },
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: DIALOG_CARD.backgroundColor, zIndex: 20, elevation: 20 },
  hud: { zIndex: 3, elevation: 3, flexDirection: 'row', gap: 12, backgroundColor: 'rgba(0,40,90,0.45)', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 5, marginTop: 6 },
  hudItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hudText: { fontFamily: 'Shark', fontSize: 18, color: '#FFFFFF' },
  stage: { zIndex: 1, width: ART + 50, height: ART + 30, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  // Pale core with the section colour as a ring: a bright accent at low alpha over the blue card reads olive.
  breathe: { position: 'absolute', width: ART * 0.9, height: ART * 0.9, borderRadius: ART, top: 15 + ART * (BADGE_CY - 0.45), backgroundColor: 'rgba(255,255,255,0.16)', borderWidth: 5 },
  shadow: { position: 'absolute', bottom: 10 },
  artBox: { width: ART, height: ART },
  bleed: { position: 'absolute', left: 0, right: 0, bottom: 0, overflow: 'hidden' },
  bleedInner: { position: 'absolute', left: 0, right: 0, bottom: 0, height: ART },
  inkEdge: { position: 'absolute', left: ART * 0.16, top: -2 },
  stampHere: {
    position: 'absolute', left: ART * 0.08, right: ART * 0.08, top: ART * (BADGE_CY - 0.42), height: ART * 0.84,
    borderRadius: ART, borderWidth: 3, borderStyle: 'dashed',
  },
  lock: {
    position: 'absolute', right: ART * 0.1, bottom: ART * 0.06, width: 38, height: 38, borderRadius: 19, backgroundColor: '#0B2A55',
    borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  secret: { width: ART * 0.82, height: ART * 0.82, borderRadius: ART, borderWidth: 5, borderStyle: 'dashed', alignSelf: 'center', marginTop: ART * 0.09, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,207,59,0.15)' },
  // Badge-shaped (round) flash on the badge, not a rectangle over the stage.
  flash: { position: 'absolute', width: ART * 0.72, height: ART * 0.72, borderRadius: ART, backgroundColor: '#FFFFFF', top: 15 + ART * (BADGE_CY - 0.36) },
  rarity: { zIndex: 3, elevation: 3, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 3, borderWidth: 2.5 },
  rarityGold: { backgroundColor: LEGENDARY_GOLD, borderColor: INK, borderWidth: 2.5 },
  rarityText: { fontFamily: 'Shark', fontSize: 14, color: RARITY_INK, letterSpacing: 1 },
  earned: { zIndex: 3, fontFamily: 'Shark', fontSize: 18, color: '#FFFFFF', marginTop: 6, textShadowColor: '#05346e', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 },
  remainingRow: { zIndex: 3, flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6 },
  remaining: { fontFamily: 'Shark', fontSize: 22, color: '#FFCF3B', textShadowColor: '#05346e', textShadowOffset: { width: 1.5, height: 1.5 }, textShadowRadius: 0 },
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
  actionSlot: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  hidden: { opacity: 0 },
  status: {
    position: 'absolute', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 8,
    borderRadius: 20, backgroundColor: 'rgba(0,40,90,0.5)', borderWidth: 2.5, borderColor: '#FFFFFF',
  },
  statusText: { fontFamily: 'Shark', fontSize: 22, color: '#FFFFFF', textShadowColor: '#05346e', textShadowOffset: { width: 1.5, height: 1.5 }, textShadowRadius: 0 },
  preload: { position: 'absolute', opacity: 0, width: 1, height: 1, overflow: 'hidden' },
  levelUpWrap: { position: 'absolute', left: 24, right: 24, top: '30%', zIndex: 30, elevation: 30 },
  levelUpConfetti: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  levelUpPlate: {
    alignItems: 'center', paddingVertical: 18, paddingHorizontal: 12, borderRadius: 22,
    backgroundColor: LEGENDARY_GOLD, borderWidth: 4, borderColor: '#FFFFFF', overflow: 'hidden',
  },
  levelUpPill: { marginTop: 6, backgroundColor: INK, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 4, borderWidth: 2, borderColor: '#FFFFFF' },
  levelUpTitle: { fontFamily: 'Shark', fontSize: 34, color: '#FFFFFF', textShadowColor: '#8A5A00', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  levelUpLevel: { fontFamily: 'Shark', fontSize: 22, color: '#FFFFFF' },
  message: { fontFamily: 'Knockout', fontSize: 15, color: '#E2F6FF', textAlign: 'center', marginTop: 8 },
  where: {
    flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: 'rgba(0,40,90,0.45)', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 3,
  },
  whereText: { fontFamily: 'Knockout', fontSize: 13, color: '#FFFFFF' },
  titleBox: {
    width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingVertical: 7, paddingHorizontal: 9,
    borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,207,59,0.75)', backgroundColor: 'rgba(0,40,90,0.3)',
  },
  titleBoxOwned: { borderStyle: 'solid', borderColor: '#FFCF3B', backgroundColor: 'rgba(255,207,59,0.16)' },
  titlePill: {
    flexShrink: 1, maxWidth: '58%', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFCF3B', borderRadius: 16,
    paddingHorizontal: 9, minHeight: 32, borderWidth: 2, borderColor: '#FFFFFF', borderBottomWidth: 4, borderBottomColor: '#D99A00',
  },
  titlePillLocked: { backgroundColor: '#DCE6F2', borderBottomColor: '#9FB2C9' },
  titlePillText: { flexShrink: 1, fontFamily: 'Shark', fontSize: 16, color: INK },
  titlePillTextLocked: { color: '#4A5A78' },
  titleLine: { flex: 1, fontFamily: 'Knockout', fontSize: 15, lineHeight: 18, color: '#FFFFFF' },
});

/** Level-up moment: the stamp's XP moved the level bar. A gold ribbon pops over the card with a fanfare. */
function LevelUp({ level, reducedMotion, onDone }: { level: number; reducedMotion: boolean; onDone: () => void }) {
  // The plate is a static, opaque, full-size view; only its wrapper scales and fades, so the gold
  // fill covers the whole plate from the first frame.
  // Opaque from its first frame: it pops in by scale only and fades only on the way out.
  const pop = useSharedValue(reducedMotion ? 1 : 0.4);
  const fade = useSharedValue(1);
  useEffect(() => {
    haptic('success');
    playSfx('fx.redeemOpen');
    if (!reducedMotion) pop.value = withSpring(1, { damping: 9, stiffness: 260 });
    const out = setTimeout(() => { fade.value = withTiming(0, { duration: 260 }); }, 1500);
    const done = setTimeout(onDone, 1800);
    return () => { clearTimeout(out); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: fade.value, transform: [{ scale: pop.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.levelUpWrap, style]} accessibilityLiveRegion="assertive">
      {/* Confetti sits behind the plate so it never covers the words or the level number. */}
      {!reducedMotion && <View style={styles.levelUpConfetti}><Confetti width={300} height={240} seed={level} count={24} /></View>}
      <View style={styles.levelUpPlate}>
        <GameIcon name="xp" size={48} />
        <Text style={styles.levelUpTitle} maxFontSizeMultiplier={1.2}>LEVEL UP!</Text>
        <View style={styles.levelUpPill}><Text style={styles.levelUpLevel} maxFontSizeMultiplier={1.2}>Level {level}</Text></View>
      </View>
    </Animated.View>
  );
}
