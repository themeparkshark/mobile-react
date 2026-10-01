/**
 * Trivia Duel overlays: tier stamps (line-boiled, 11.0), Fin's bark bubble
 * with typed babble (7.3), the VS intro (11.3), the round ribbon, the FIN'S
 * FINAL card, wager chips (5.5), the Buzz Bell (11.6) and the Closest Number
 * slider. All copy is plain text, no emoji; fonts are Shark and Knockout.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { TextInput } from 'react-native';
import Animated, {
  Easing, runOnJS, useAnimatedProps, useAnimatedStyle, useFrameCallback, useSharedValue, withDelay, withRepeat, withSequence,
  withSpring, withTiming, type SharedValue,
} from 'react-native-reanimated';
import { ART, C, FIN_POSES, SHARKS, type SharkLook } from '../art';
import { babble, type BabbleVoice } from '../audio';

const OUTLINE = { textShadowColor: C.ink, textShadowRadius: 0.01 };
Animated.addWhitelistedNativeProps({ text: true });
const AnimatedInput = Animated.createAnimatedComponent(TextInput);

/** Thick cartoon outline for Shark-font text: 8 offset copies under the fill. */
export function OutlinedText({ text, size, color, stroke = C.ink, width = 3, style }: { text: string; size: number; color: string; stroke?: string; width?: number; style?: object }) {
  const offs = [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1.3], [0, 1.3], [-1.3, 0], [1.3, 0]];
  return (
    <View style={style}>
      {offs.map(([x, y], i) => (
        <Text key={i} allowFontScaling={false} style={[styles.stampText, { fontSize: size, color: stroke, position: 'absolute', left: x * width, top: y * width }]}>{text}</Text>
      ))}
      <Text allowFontScaling={false} style={[styles.stampText, { fontSize: size, color }]}>{text}</Text>
    </View>
  );
}

/** Line-boil: 3 seeded 1px offsets cycled at 10fps. */
function useBoil(active: boolean) {
  const t = useSharedValue(0);
  useFrameCallback((f) => {
    'worklet';
    if (!active || f.timeSincePreviousFrame == null) return;
    t.value += f.timeSincePreviousFrame;
  });
  return useAnimatedStyle(() => {
    const k = Math.floor(t.value / 100) % 3;
    const dx = k === 0 ? 0 : k === 1 ? 1 : -0.6;
    const dy = k === 0 ? -0.6 : k === 1 ? 0.5 : 0;
    return { transform: [{ translateX: dx }, { translateY: dy }] };
  });
}

export interface StampSpec {
  key: number;
  text: string;
  color: string;
  size: number;
  x: number;
  y: number;
  sub?: string;
}

export function Stamp({ spec, reducedMotion }: { spec: StampSpec; reducedMotion: boolean }) {
  const s = useSharedValue(reducedMotion ? 1 : 2.2);
  const y = useSharedValue(0);
  const o = useSharedValue(reducedMotion ? 0 : 1);
  const boil = useBoil(!reducedMotion);
  useEffect(() => {
    if (reducedMotion) {
      o.value = withSequence(withTiming(1, { duration: 150 }), withDelay(500, withTiming(0, { duration: 150 })));
      return;
    }
    s.value = 2.2;
    o.value = 1;
    y.value = 0;
    s.value = withSequence(withTiming(1, { duration: 120, easing: Easing.out(Easing.back(2)) }), withSpring(1));
    y.value = withDelay(160, withTiming(-40, { duration: 500, easing: Easing.out(Easing.cubic) }));
    o.value = withDelay(560, withTiming(0, { duration: 180 }));
  }, [spec.key, s, y, o, reducedMotion]);
  const st = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: y.value }, { scale: s.value }, { rotate: '-4deg' }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.stamp, { left: spec.x - 150, top: spec.y - spec.size }, st]}>
      <Animated.View style={boil}>
        <OutlinedText text={spec.text} size={spec.size} color={spec.color} />
      </Animated.View>
      {spec.sub ? <OutlinedText text={spec.sub} size={Math.round(spec.size * 0.62)} color="#ffffff" width={2} /> : null}
    </Animated.View>
  );
}

// -- Bark bubble ----------------------------------------------------------------

export function Bark({ text, barkKey, side, onTalk, muted, voice }: { text: string | null; barkKey: number; side: 'left' | 'right'; onTalk: (talking: boolean) => void; muted?: boolean; voice?: BabbleVoice }) {
  const [shown, setShown] = useState('');
  const s = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (timer.current) clearInterval(timer.current);
    if (!text) {
      s.value = withTiming(0, { duration: 120 });
      onTalk(false);
      return;
    }
    setShown('');
    s.value = withSequence(withTiming(1.12, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 320 }));
    let i = 0;
    onTalk(true);
    timer.current = setInterval(() => {
      i++;
      setShown(text.slice(0, i));
      if (!muted) babble(i, text, voice);
      if (i >= text.length) {
        if (timer.current) clearInterval(timer.current);
        onTalk(false);
      }
    }, 28);
    const hide = setTimeout(() => { s.value = withTiming(0, { duration: 160 }); }, Math.max(1400, text.length * 28 + 900));
    return () => {
      if (timer.current) clearInterval(timer.current);
      clearTimeout(hide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barkKey]);
  const st = useAnimatedStyle(() => ({ opacity: s.value > 0.05 ? 1 : 0, transform: [{ scale: s.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.bark, side === 'right' ? { right: 12 } : { left: 12 }, st]}>
      {/* The full line lays out up front (the rest is transparent), so the bubble never grows while it types. */}
      <Text style={styles.barkText}>{shown}<Text style={{ color: 'transparent' }}>{text ? text.slice(shown.length) : ''}</Text></Text>
      <View style={[styles.barkTail, side === 'right' ? { right: 40 } : { left: 40 }]} />
    </Animated.View>
  );
}

// -- VS intro (11.3) ---------------------------------------------------------------

export function VsIntro({ ms, meName, oppName, oppLook, rankLabel, onDone, reducedMotion }: {
  ms: number; meName: string; oppName: string; oppLook: SharkLook | 'fin'; rankLabel: string; onDone: () => void; reducedMotion: boolean;
}) {
  const panels = useSharedValue(0);
  const me = useSharedValue(-420);
  const opp = useSharedValue(420);
  const vs = useSharedValue(0);
  const names = useSharedValue(0);
  const out = useSharedValue(1);
  const k = ms / 1400;
  const boil = useBoil(!reducedMotion);
  useEffect(() => {
    if (reducedMotion) {
      panels.value = 1; me.value = 0; opp.value = 0; vs.value = 1; names.value = 1;
      out.value = withDelay(ms - 300, withTiming(0, { duration: 300 }, (d) => { 'worklet'; if (d) runOnJS(onDone)(); }));
      return;
    }
    panels.value = withTiming(1, { duration: 160 * k });
    me.value = withTiming(0, { duration: 320 * k, easing: Easing.out(Easing.back(1.4)) });
    opp.value = withDelay(80 * k, withTiming(0, { duration: 320 * k, easing: Easing.out(Easing.back(1.4)) }));
    vs.value = withDelay(400 * k, withSequence(withTiming(1, { duration: 140 * k }), withTiming(1, { duration: 120 }), withSpring(1)));
    names.value = withDelay(640 * k, withTiming(1, { duration: 260 * k }));
    out.value = withDelay(1250 * k, withTiming(0, { duration: 150 * k }, (d) => { 'worklet'; if (d) runOnJS(onDone)(); }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const leftP = useAnimatedStyle(() => ({ transform: [{ translateX: (panels.value - 1) * 500 }, { skewX: '-12deg' }] }));
  const rightP = useAnimatedStyle(() => ({ transform: [{ translateX: (1 - panels.value) * 500 }, { skewX: '-12deg' }] }));
  const meS = useAnimatedStyle(() => ({ transform: [{ translateX: me.value }] }));
  const oppS = useAnimatedStyle(() => ({ transform: [{ translateX: opp.value }] }));
  const vsS = useAnimatedStyle(() => ({ opacity: vs.value > 0 ? 1 : 0, transform: [{ scale: 3 - 2 * vs.value }, { rotate: '-8deg' }] }));
  const nameS = useAnimatedStyle(() => ({ opacity: names.value, transform: [{ translateY: (1 - names.value) * 16 }] }));
  const outS = useAnimatedStyle(() => ({ opacity: out.value }));
  return (
    <Pressable style={StyleSheet.absoluteFill} onPress={onDone} accessibilityLabel="Skip intro">
      <Animated.View style={[StyleSheet.absoluteFill, styles.vsRoot, outS]}>
        <Animated.View style={[styles.vsPanel, { left: -60, backgroundColor: C.blue }, leftP]}>
          {Array.from({ length: 7 }, (_, i) => <View key={i} style={[styles.speed, { top: 60 + i * 70, left: 30 + (i % 3) * 40 }]} />)}
        </Animated.View>
        <Animated.View style={[styles.vsPanel, { right: -60, backgroundColor: C.gold }, rightP]}>
          {Array.from({ length: 7 }, (_, i) => <View key={i} style={[styles.speed, { top: 90 + i * 70, right: 30 + (i % 3) * 40 }]} />)}
        </Animated.View>
        <View style={styles.seam} />
        <Animated.View style={[styles.vsMe, meS]}>
          <Image source={SHARKS.classic} style={[styles.vsImg, { transform: [{ scaleX: -1 }] }]} />
        </Animated.View>
        <Animated.View style={[styles.vsOpp, oppS]}>
          <Image source={oppLook === 'fin' ? FIN_POSES.point : SHARKS[oppLook]} style={styles.vsImg} resizeMode="contain" />
          {oppLook === 'fin' ? <Image source={ART.hat} style={styles.vsHat} resizeMode="contain" /> : null}
        </Animated.View>
        <Animated.View style={[styles.vsMark, vsS]}>
          <Animated.View style={boil}><OutlinedText text="VS" size={96} color="#ffffff" width={4} /></Animated.View>
        </Animated.View>
        <Animated.View style={[styles.vsNames, nameS]}>
          <OutlinedText text={meName} size={26} color="#ffffff" width={2} />
          <View style={{ alignItems: 'flex-end' }}>
            <OutlinedText text={oppName} size={26} color="#ffffff" width={2} />
            <Text style={styles.rank}>{rankLabel}</Text>
          </View>
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

// -- Round ribbon -----------------------------------------------------------------

export function Ribbon({ text, holdMs, ribbonKey, reducedMotion }: { text: string; holdMs: number; ribbonKey: number; reducedMotion: boolean }) {
  const y = useSharedValue(-120);
  useEffect(() => {
    if (reducedMotion) { y.value = 0; y.value = withDelay(300 + holdMs, withTiming(-120, { duration: 1 })); return; }
    y.value = -120;
    y.value = withSequence(withSpring(0, { damping: 12, stiffness: 260 }), withDelay(holdMs, withTiming(-140, { duration: 180, easing: Easing.in(Easing.quad) })));
  }, [ribbonKey, y, holdMs, reducedMotion]);
  const st = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return (
    <Animated.View pointerEvents="none" style={[styles.ribbon, st]}>
      <Image source={ART.ribbon} style={styles.ribbonImg} resizeMode="stretch" />
      <OutlinedText text={text} size={22} color="#ffffff" width={2} style={styles.ribbonText} />
    </Animated.View>
  );
}

// -- Wager chips (5.5, rev 7) ------------------------------------------------------

/**
 * Three chips in the tile grid: SAFE / HALF / ALL IN. Each chip shows one
 * number: your score if you're right with base points. The suggested chip
 * glows gold with a one-line reason; doing nothing takes it.
 */
export function WagerChips({ stakes, labels, picked, suggested, reason, ifRight, onPick, secondsLeft, category, height }: {
  stakes: number[]; labels: readonly string[]; picked: number; suggested: number; reason: string; ifRight: number[];
  onPick: (i: number) => void; secondsLeft: number; category: string; height: number;
}) {
  return (
    <View style={[styles.wager, { height }]}>
      <Text style={styles.wagerTitle} numberOfLines={1}>{`BET ON ${category.toUpperCase()}`}</Text>
      <View style={styles.chipRow}>
        {stakes.map((s, i) => (
          <Chip key={i} i={i} label={labels[i]} stake={s} ifRight={ifRight[i]} picked={picked === i} suggested={suggested === i} onPick={onPick} />
        ))}
      </View>
      <Text style={styles.reason}>{`${reason}  ${secondsLeft}s`}</Text>
    </View>
  );
}

function Chip({ i, label, stake, ifRight, picked, suggested, onPick }: { i: number; label: string; stake: number; ifRight: number; picked: boolean; suggested: boolean; onPick: (i: number) => void }) {
  const s = useSharedValue(0);
  const glow = useSharedValue(0);
  useEffect(() => {
    s.value = withDelay(40 * i, withSequence(withTiming(1.12, { duration: 120 }), withSpring(1, { damping: 8, stiffness: 300 })));
  }, [s, i]);
  useEffect(() => {
    glow.value = suggested ? withRepeat(withSequence(withTiming(1, { duration: 420 }), withTiming(0.45, { duration: 420 })), -1, true) : withTiming(0, { duration: 120 });
  }, [suggested, glow]);
  useEffect(() => {
    if (picked) s.value = withSequence(withTiming(0.9, { duration: 60 }), withSpring(1.04, { damping: 7, stiffness: 400 }));
  }, [picked, s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  const glowSt = useAnimatedStyle(() => ({ opacity: glow.value }));
  const colors = [C.cream, '#bfe8ff', '#ffe58a'];
  return (
    <Animated.View style={[styles.chipCell, st]}>
      <Animated.View pointerEvents="none" style={[styles.chipGlow, glowSt]} />
      <Pressable onPress={() => onPick(i)} style={[styles.chip, { backgroundColor: colors[i] ?? C.cream }, picked && styles.chipPicked]} accessibilityRole="button" accessibilityLabel={`${label}, stake ${stake}, ${ifRight} if right`}>
        <Text style={styles.chipLabel}>{label}</Text>
        <Text style={[styles.chipIfRight, suggested && styles.chipIfRightBig]}>{ifRight}</Text>
        <Text style={styles.chipStake}>{stake === 0 ? 'no risk' : `bet ${stake}`}</Text>
      </Pressable>
    </Animated.View>
  );
}

// -- Final category pick (5.5, rev 7) ---------------------------------------------------

/** Two category cards in the tile grid (2.5s, default left). The trailing player picks; the leader watches. */
export function CategoryPick({ cats, mine, picked, left, oppName, onPick, height }: {
  cats: readonly [string, string]; mine: boolean; picked: number; left: number; oppName: string; onPick: (i: number) => void; height: number;
}) {
  return (
    <View style={[styles.wager, { height }]}>
      <Text style={styles.wagerTitle}>{mine ? 'YOU PICK THE FINAL' : `${oppName.toUpperCase()} IS PICKING`}</Text>
      <View style={[styles.chipRow, { flex: 1 }]}>
        {cats.map((c, i) => <CategoryCard key={i} i={i} label={c} picked={picked === i} out={picked >= 0 && picked !== i} disabled={!mine || picked >= 0} onPick={onPick} />)}
      </View>
      <Text style={styles.reason}>{mine ? `Behind picks the topic.  ${left}s` : 'Behind picks the topic.'}</Text>
    </View>
  );
}

function CategoryCard({ i, label, picked, out, disabled, onPick }: { i: number; label: string; picked: boolean; out: boolean; disabled: boolean; onPick: (i: number) => void }) {
  const s = useSharedValue(0);
  const flip = useSharedValue(90);
  useEffect(() => {
    flip.value = withDelay(60 * i, withTiming(0, { duration: 260, easing: Easing.out(Easing.back(1.6)) }));
    s.value = withDelay(60 * i, withSpring(1, { damping: 9, stiffness: 260 }));
  }, [s, flip, i]);
  useEffect(() => {
    if (picked) s.value = withSequence(withTiming(0.9, { duration: 70 }), withSpring(1.1, { damping: 7, stiffness: 380 }));
    if (out) s.value = withTiming(0.82, { duration: 160 });
  }, [picked, out, s]);
  const st = useAnimatedStyle(() => ({ opacity: out ? 0.45 : 1, transform: [{ scaleX: Math.max(0.02, Math.cos((flip.value * Math.PI) / 180)) }, { scale: s.value }] }));
  return (
    <Animated.View style={[styles.catCell, st]}>
      <Pressable disabled={disabled} onPress={() => onPick(i)} style={[styles.catCard, { backgroundColor: i === 0 ? '#bfe8ff' : '#ffe58a' }, picked && styles.chipPicked]} accessibilityRole="button" accessibilityLabel={`Final category ${label}`}>
        <Text style={styles.catLabel} numberOfLines={2} adjustsFontSizeToFit>{label.toUpperCase()}</Text>
        <Text style={styles.chipStake}>HARD</Text>
      </Pressable>
    </Animated.View>
  );
}

// -- Buzz Bell (5.4 / 11.8, rev 7) -------------------------------------------------------

/**
 * The 120pt desk bell, live from unlock. Shows its live stake in gold
 * ("+{(150 + speed) x m}", the one big number of the bell phase) and the
 * flat "-100" in coral. Sways +/-4 deg on 1200ms.
 */
export function BuzzBell({ onBuzz, disabled, pressedKey, reducedMotion, stake, risk }: {
  onBuzz: () => void; disabled: boolean; pressedKey: number; reducedMotion: boolean; stake: SharedValue<number>; risk: string;
}) {
  const sway = useSharedValue(0);
  const sq = useSharedValue(1);
  useEffect(() => {
    if (reducedMotion) return;
    sway.value = withRepeat(withSequence(withTiming(4, { duration: 600, easing: Easing.inOut(Easing.sin) }), withTiming(-4, { duration: 600, easing: Easing.inOut(Easing.sin) })), -1, true);
  }, [sway, reducedMotion]);
  useEffect(() => {
    if (!pressedKey) return;
    sq.value = withSequence(withTiming(0.85, { duration: 45 }), withTiming(1.15, { duration: 90 }), withSpring(1, { damping: 8, stiffness: 300 }));
  }, [pressedKey, sq]);
  const st = useAnimatedStyle(() => ({ transform: [{ rotate: `${sway.value}deg` }, { scaleX: sq.value }, { scaleY: 2 - sq.value }] }));
  const stakeText = useAnimatedProps(() => ({ text: `+${Math.round(stake.value)}` } as never));
  const g = Gesture.Tap().maxDuration(800).onBegin(() => {
    'worklet';
    runOnJS(onBuzz)();
  }).enabled(!disabled);
  return (
    <GestureDetector gesture={g}>
      <View style={styles.bellWrap} accessibilityRole="button" accessibilityLabel="Buzz in">
        <Animated.View style={[styles.bell, st]}>
          <Image source={ART.bell} style={styles.bellImg} resizeMode="contain" />
          <OutlinedText text="BUZZ!" size={24} color="#ffffff" width={2} style={styles.bellText} />
        </Animated.View>
        <View style={styles.bellStakes} pointerEvents="none">
          <AnimatedInput editable={false} underlineColorAndroid="transparent" style={styles.bellStake} animatedProps={stakeText} defaultValue="+250" />
          <Text style={styles.bellRisk}>{risk}</Text>
        </View>
      </View>
    </GestureDetector>
  );
}

// -- Closest Number slider --------------------------------------------------------------

export function ClosestSlider({ min, max, value, onChange, onLock, disabled, width, narrow }: {
  min: number; max: number; value: number; onChange: (v: number) => void; onLock: () => void; disabled: boolean; width: number; narrow: [number, number] | null;
}) {
  const lo = narrow ? narrow[0] : min;
  const hi = narrow ? narrow[1] : max;
  const trackW = width - 40;
  const x = useSharedValue(((value - lo) / Math.max(1, hi - lo)) * trackW);
  const last = useRef(value);
  const emit = (v: number) => {
    if (v !== last.current) { last.current = v; onChange(v); }
  };
  useEffect(() => {
    x.value = ((value - lo) / Math.max(1, hi - lo)) * trackW;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lo, hi]);
  const pan = Gesture.Pan().minDistance(0).enabled(!disabled).onChange((e) => {
    'worklet';
    x.value = Math.min(trackW, Math.max(0, x.value + e.changeX));
    runOnJS(emit)(Math.round(lo + (x.value / trackW) * (hi - lo)));
  });
  const thumb = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  return (
    <View style={[styles.slider, { width }]}>
      <OutlinedText text={String(value)} size={40} color={C.gold} width={2.5} style={{ alignSelf: 'center' }} />
      <GestureDetector gesture={pan}>
        <View style={[styles.track, { width: trackW + 36 }]}>
          <View style={[styles.trackBar, { width: trackW }]} />
          <Text style={[styles.trackLabel, { left: 0 }]}>{lo}</Text>
          <Text style={[styles.trackLabel, { right: 0 }]}>{hi}</Text>
          <Animated.View style={[styles.thumb, thumb]}>
            <Image source={ART.coin} style={styles.thumbImg} />
          </Animated.View>
        </View>
      </GestureDetector>
      <Pressable style={[styles.lockBtn, disabled && { opacity: 0.5 }]} onPress={onLock} disabled={disabled} accessibilityRole="button">
        <Text style={styles.lockBtnText}>LOCK IT IN</Text>
      </Pressable>
    </View>
  );
}

// -- Chomp button (6, rev 7: the only lifeline) ---------------------------------------

/** 56pt Chomp button at the board's bottom-right, only while you hold one. */
export function LifelineButton({ onPress }: { onPress: () => void }) {
  const s = useSharedValue(0);
  useEffect(() => { s.value = withSpring(1, { damping: 9, stiffness: 260 }); }, [s]);
  const st = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <Animated.View style={st}>
      <Pressable onPress={onPress} style={styles.lifeline} accessibilityRole="button" accessibilityLabel="Chomp: clear two wrong answers" hitSlop={8}>
        <Image source={ART.chomp} style={styles.lifeImg} resizeMode="contain" />
        <Text style={styles.lifeText}>CHOMP</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  stampText: { fontFamily: 'Shark', textAlign: 'center', ...OUTLINE },
  stamp: { position: 'absolute', width: 300, alignItems: 'center' },
  bark: { position: 'absolute', top: 8, maxWidth: 220, backgroundColor: C.cream, borderWidth: 3, borderColor: C.ink, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  barkText: { fontFamily: 'Knockout', fontSize: 17, color: C.navy, minHeight: 20 },
  barkTail: { position: 'absolute', bottom: -9, width: 16, height: 16, backgroundColor: C.cream, borderRightWidth: 3, borderBottomWidth: 3, borderColor: C.ink, transform: [{ rotate: '45deg' }] },
  vsRoot: { overflow: 'hidden', zIndex: 50 },
  vsPanel: { position: 'absolute', top: -40, bottom: -40, width: '62%', borderWidth: 3, borderColor: C.ink },
  seam: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 6, marginLeft: -3, backgroundColor: C.ink, transform: [{ skewX: '-12deg' }] },
  speed: { position: 'absolute', width: 90, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.75)' },
  vsMe: { position: 'absolute', left: 10, top: '26%' },
  vsOpp: { position: 'absolute', right: 6, top: '42%' },
  vsImg: { width: 190, height: 200 },
  // Fin's captain hat sits on his head in the VS card too (cell 206 x 241 scaled into 190 x 200).
  vsHat: { position: 'absolute', width: 118, height: 99, left: 52, top: -46, transform: [{ rotate: '-12deg' }] },
  vsMark: { position: 'absolute', alignSelf: 'center', top: '38%' },
  vsNames: { position: 'absolute', left: 20, right: 20, bottom: '18%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  rank: { fontFamily: 'Knockout', fontSize: 15, color: C.navy, backgroundColor: C.cream, borderRadius: 8, borderWidth: 2, borderColor: C.ink, paddingHorizontal: 6, marginTop: 2 },
  ribbon: { position: 'absolute', top: 0, alignSelf: 'center', width: 300, height: 64, alignItems: 'center', justifyContent: 'center', zIndex: 30 },
  ribbonImg: { position: 'absolute', width: 300, height: 64 },
  ribbonText: { marginTop: -6 },
  wager: { alignItems: 'center', justifyContent: 'space-between', paddingTop: 2, paddingBottom: 4 },
  wagerTitle: { fontFamily: 'Shark', fontSize: 20, color: C.navy, opacity: 0.6 },
  reason: { fontFamily: 'Knockout', fontSize: 16, color: C.navy },
  chipRow: { flexDirection: 'row', alignSelf: 'stretch', justifyContent: 'space-between' },
  chipCell: { flex: 1, marginHorizontal: 4 },
  chipGlow: { position: 'absolute', left: -6, right: -6, top: -6, bottom: -6, borderRadius: 24, backgroundColor: 'rgba(254,201,14,0.55)' },
  chip: { height: 118, borderRadius: 18, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 7, alignItems: 'center', justifyContent: 'center' },
  chipIfRight: { fontFamily: 'Knockout', fontSize: 24, color: C.navy, opacity: 0.6, marginTop: 2 },
  chipIfRightBig: { fontSize: 30, opacity: 1 },
  catCell: { flex: 1, paddingHorizontal: 6 },
  catCard: { flex: 1, borderRadius: 20, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  catLabel: { fontFamily: 'Shark', fontSize: 28, color: C.navy, textAlign: 'center' },
  chipPicked: { borderColor: C.goldDeep, borderWidth: 5, borderBottomWidth: 8 },
  chipLabel: { fontFamily: 'Shark', fontSize: 24, color: C.navy },
  chipStake: { fontFamily: 'Knockout', fontSize: 14, color: C.navy, opacity: 0.6 },
  bellWrap: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', zIndex: 20 },
  bell: { width: 150, height: 150, alignItems: 'center', justifyContent: 'center' },
  bellImg: { width: 120, height: 120 },
  bellText: { marginTop: -18 },
  bellStakes: { position: 'absolute', right: 8, top: 18, alignItems: 'flex-end' },
  bellStake: { fontFamily: 'Knockout', fontSize: 30, color: C.goldDeep, padding: 0, margin: 0, minWidth: 80, textAlign: 'right', textShadowColor: C.ink, textShadowRadius: 1 },
  bellRisk: { fontFamily: 'Knockout', fontSize: 18, color: C.coral, opacity: 0.85 },
  slider: { alignItems: 'center', alignSelf: 'center' },
  track: { height: 64, justifyContent: 'center', paddingHorizontal: 18 },
  trackBar: { height: 14, borderRadius: 7, backgroundColor: '#bfe8ff', borderWidth: 3, borderColor: C.ink },
  trackLabel: { position: 'absolute', bottom: -6, fontFamily: 'Knockout', fontSize: 14, color: C.navy },
  thumb: { position: 'absolute', left: 0, width: 36, height: 36 },
  thumbImg: { width: 36, height: 36 },
  lockBtn: { marginTop: 12, height: 64, width: '100%', borderRadius: 18, backgroundColor: C.gold, borderWidth: 3, borderColor: C.ink, borderBottomWidth: 7, alignItems: 'center', justifyContent: 'center' },
  lockBtnText: { fontFamily: 'Shark', fontSize: 26, color: C.navy },
  lifeline: { width: 56, height: 56, borderRadius: 16, backgroundColor: '#ffffff', borderWidth: 3, borderColor: C.ink, borderBottomWidth: 5, alignItems: 'center', justifyContent: 'center' },
  lifeImg: { width: 36, height: 30 },
  lifeText: { fontFamily: 'Knockout', fontSize: 10, color: C.navy },
});
