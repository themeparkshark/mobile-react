import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import HapticPatterns from '../../../helpers/hapticPatterns';
import { playSfx } from '../../../gamekit/SFX';
import { createNavigationPanel, createNavigationPanelProgress, nextNavigationRepair,
  traceNavigationPanel, type NavigationPanelProgress } from '../../../services/lineplay/navigationPanel';

interface Props {
  readonly seed: number;
  readonly progress?: NavigationPanelProgress;
  readonly completed: boolean;
  readonly paused: boolean;
  readonly onTurn: (index: number) => void;
  readonly onNewRound: () => void;
  readonly onNext: () => void;
}
const SHARK = require('../../../../assets/images/screens/lineplay/space-navigation-shark-v1.png');
const PORTS = [[1, 50, 0, 'north'], [2, 100, 50, 'east'],
  [4, 50, 100, 'south'], [8, 0, 50, 'west']] as const;

/** A short original fiction puzzle inside the existing opening chapter slot. */
export default function NavigationPanelCard({ seed, progress: saved, completed, paused, onTurn, onNewRound, onNext }: Props) {
  const progress = useMemo(() => saved ?? createNavigationPanelProgress(seed, 0, completed), [seed, saved, completed]);
  const panel = useMemo(() => createNavigationPanel(seed, progress.round), [seed, progress.round]);
  const trace = useMemo(() => traceNavigationPanel(panel, progress.rotations), [panel, progress.rotations]);
  const [showHint, setShowHint] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const reducedMotion = useReducedGameMotion();
  const reveal = useRef(new Animated.Value(trace.solved ? 1 : 0)).current;
  const scroll = useRef<ScrollView>(null);
  const scrollToPayoff = useRef(false);
  const previousSolved = useRef(trace.solved);
  const previousRound = useRef(progress.round);
  const hint = showHint ? nextNavigationRepair(panel, progress) : null;

  useEffect(() => {
    if (previousRound.current !== progress.round) {
      previousRound.current = progress.round;
      setShowHint(false);
    }
    if (!trace.solved) scrollToPayoff.current = false;
    if (trace.solved && !previousSolved.current) {
      scrollToPayoff.current = true;
      HapticPatterns.success(); playSfx('win');
      void AccessibilityInfo.announceForAccessibility('Navigation online. All three signals connected. The next clue is ready.');
    }
    previousSolved.current = trace.solved;
  }, [progress.round, trace.solved]);
  useEffect(() => {
    let animation: Animated.CompositeAnimation | undefined;
    reveal.stopAnimation();
    if (!trace.solved) reveal.setValue(0);
    else if (reducedMotion) reveal.setValue(1);
    else {
      animation = Animated.timing(reveal, { toValue: 1, duration: 240, useNativeDriver: true });
      animation.start();
    }
    return () => { animation?.stop(); reveal.stopAnimation(); };
  }, [trace.solved, reducedMotion, reveal]);

  const turn = (index: number) => {
    if (paused || trace.solved) return;
    onTurn(index); HapticPatterns.selection(); playSfx('tick', 0.45);
  };

  return <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.card}
    onContentSizeChange={() => {
      if (!scrollToPayoff.current || !scroll.current) return;
      scrollToPayoff.current = false;
      scroll.current.scrollToEnd({ animated: !reducedMotion });
    }}>
    <LinearGradient colors={['#126ac1', '#072d6b']} style={styles.hero}>
      <View style={styles.heroCopy}>
        <Text style={styles.kicker}>STARPORT · MISSION 1 OF 3</Text>
        <Text style={styles.title}>{trace.solved ? 'Navigation online!' : 'Repair the signal'}</Text>
        <Text style={styles.heroHint}>{panel.name} · circuit {progress.round + 1}</Text>
      </View>
      <Image source={artFailed ? require('../../../../assets/images/tutorial/teacher-shark.png') : SHARK}
        onError={() => setArtFailed(true)} style={styles.shark} contentFit="contain"
        accessibilityLabel="Your shark navigator points toward the signal puzzle" />
    </LinearGradient>

    <View style={styles.brief}>
      <Pressable style={styles.turnIcon} disabled={paused || trace.solved}
        onPress={() => setShowHint(value => !value)} accessibilityRole="button"
        accessibilityLabel={showHint ? 'Hide the circuit clue' : 'Show a clue for this circuit'}
        accessibilityState={{ disabled: paused || trace.solved, expanded: showHint }}>
        <Text style={styles.turnIconText}>?</Text>
      </Pressable>
      <Text style={styles.instruction}>Tap tiles to turn them. Link all three stars to the exit.</Text>
    </View>
    <View style={styles.panel}>
      <View style={styles.panelTop}>
        <Text style={styles.panelName}>{paused ? 'PANEL PAUSED' : trace.solved ? 'SIGNAL RESTORED' : 'SIGNAL REPAIR'}</Text>
        <View style={styles.relays} accessibilityLabel={`${trace.signals} of 3 star signals connected`}>
          {panel.relays.map(index => <View key={index} style={[styles.relay,
            trace.connected.includes(index) && styles.relayOn]}><Text style={styles.relayText}>✦</Text></View>)}
        </View>
      </View>
      <View style={styles.terminals}>
        <Text style={styles.terminalIn}>SIGNAL IN →</Text>
        <Text style={[styles.terminalOut, trace.reachesExit && styles.terminalOn]}>→ EXIT</Text>
      </View>
      <View style={styles.grid}>
        <Text style={styles.entryArrow} accessible={false}>→</Text>
        <Text style={[styles.exitArrow, trace.reachesExit && styles.terminalOn]} accessible={false}>→</Text>
        {[0, 1, 2].map(row => <View key={row} style={styles.row}>
          {[0, 1, 2].map(column => {
            const index = row * 3 + column, mask = trace.masks[index];
            const active = trace.connected.includes(index), relay = panel.relays.includes(index);
            const ports = PORTS.filter(([bit]) => mask & bit);
            const line = `M ${ports[0][1]} ${ports[0][2]} L 50 50 L ${ports[1][1]} ${ports[1][2]}`;
            return <Pressable key={index} onPress={() => turn(index)} disabled={paused || trace.solved}
              accessibilityRole="button" accessibilityState={{ disabled: paused || trace.solved }}
              accessibilityLabel={`Circuit tile row ${row + 1}, column ${column + 1}. ${ports.map(port => port[3]).join(' to ')}. ${active ? 'Glowing signal' : 'No signal'}${relay ? ', star relay' : ''}. Tap to rotate clockwise.`}
              style={({ pressed }) => [styles.tile, active && styles.tileOn, hint === index && styles.tileHint,
                pressed && !reducedMotion && styles.pressed]}>
              <Svg width="100%" height="100%" viewBox="0 0 100 100" accessible={false}>
                <Path d={line} stroke="#031d42" strokeWidth={19} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                <Path d={line} stroke={active ? '#74f8df' : '#809ab6'} strokeWidth={9} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                {active && <Path d={line} stroke="#e6ffff" strokeWidth={3} fill="none" strokeLinecap="round" strokeLinejoin="round" />}
                <Circle cx={50} cy={50} r={relay ? 15 : 8} fill={relay ? '#092c59' : active ? '#e6ffff' : '#506e91'}
                  stroke={relay ? active ? '#ffdf6c' : '#b39550' : '#173c65'} strokeWidth={3} />
                {relay && <Path d="M50 36 L54 46 L65 46 L56 53 L59 64 L50 58 L41 64 L44 53 L35 46 L46 46 Z"
                  fill={active ? '#ffe273' : '#b39550'} />}
              </Svg>
              {hint === index && <View style={styles.hintBadge}><Text style={styles.hintBadgeText}>↻</Text></View>}
            </Pressable>;
          })}
        </View>)}
      </View>
      <Text style={styles.panelStatus} accessibilityLiveRegion="polite">{paused ? 'Your circuit is saved. Continue when the line stops.'
        : trace.solved ? '3 / 3 stars linked · exit online'
          : hint != null ? 'Turn the gold-edged tile to reconnect the route.'
            : trace.signals === 3 ? 'Stars linked! Now connect the path to the exit.'
              : `${trace.signals} / 3 stars linked · follow the glow`}</Text>
    </View>

    {trace.solved ? <Animated.View style={[styles.success, { opacity: reveal }]}>
      <Text style={styles.successTitle}>First signal found!</Text>
      <Text style={styles.successCopy}>Your navigator can read the stars again. Find the next clue from your place in line.</Text>
      <Pressable onPress={onNext} disabled={paused} accessibilityRole="button"
        accessibilityLabel="Next mission: Find the missing signal" accessibilityState={{ disabled: paused }}
        style={[styles.primary, paused && styles.disabled]}><Text style={styles.primaryText}>FIND THE NEXT SIGNAL →</Text></Pressable>
      <Pressable onPress={onNewRound} disabled={paused} accessibilityRole="button"
        accessibilityLabel="Play another navigation circuit" accessibilityState={{ disabled: paused }}
        style={styles.secondary}><Text style={styles.secondaryText}>TRY ANOTHER CIRCUIT ↻</Text></Pressable>
    </Animated.View> : null}
    <Text style={styles.footer}>Play solo or take turns. Progress stays saved when the line moves.</Text>
  </ScrollView>;
}
const styles = StyleSheet.create({
  scroll: { flex: 1 },
  card: { padding: 12, borderRadius: 22, borderWidth: 3, borderColor: '#fff', backgroundColor: '#c5efff' },
  hero: { minHeight: 76, borderRadius: 16, flexDirection: 'row', alignItems: 'center', overflow: 'hidden', paddingLeft: 12 },
  heroCopy: { flex: 1, zIndex: 1, paddingVertical: 8 },
  kicker: { fontFamily: 'Knockout', fontSize: 11, color: '#ffe089', letterSpacing: 0.7 },
  title: { fontFamily: 'Shark', fontSize: 23, lineHeight: 27, color: '#fff', marginTop: 4 },
  heroHint: { fontFamily: 'Knockout', fontSize: 12, color: '#c4ecff', marginTop: 5 },
  shark: { width: 78, height: 86, marginRight: -7, alignSelf: 'flex-end' },
  brief: { flexDirection: 'row', alignItems: 'center', gap: 9, marginVertical: 8 },
  turnIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#ffce3a', alignItems: 'center', justifyContent: 'center' },
  turnIconText: { color: '#0b467b', fontSize: 24, fontWeight: '800' },
  instruction: { flex: 1, fontFamily: 'Knockout', fontSize: 14, lineHeight: 19, color: '#164469' },
  panel: { backgroundColor: '#062955', borderRadius: 18, borderWidth: 3, borderColor: '#518bc5', padding: 10 },
  panelTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  panelName: { flex: 1, fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8, color: '#d4ecff' },
  relays: { flexDirection: 'row', gap: 5 },
  relay: { width: 22, height: 22, borderRadius: 11, backgroundColor: '#17456e', alignItems: 'center', justifyContent: 'center' },
  relayOn: { backgroundColor: '#2a997f', borderWidth: 1, borderColor: '#8efee1' },
  relayText: { fontSize: 17, color: '#ffe08b' },
  terminals: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, marginBottom: 6 },
  terminalIn: { fontFamily: 'Knockout', fontSize: 11, color: '#87fce1' },
  terminalOut: { fontFamily: 'Knockout', fontSize: 11, color: '#b8d4f2' },
  terminalOn: { color: '#87fce1' },
  entryArrow: { position: 'absolute', left: -24, top: '50%', transform: [{ translateY: -14 }], color: '#87fce1', fontSize: 24, fontWeight: '800' },
  exitArrow: { position: 'absolute', right: -24, top: '50%', transform: [{ translateY: -14 }], color: '#809ab6', fontSize: 24, fontWeight: '800' },
  grid: { gap: 6, width: '100%', maxWidth: 240, alignSelf: 'center' }, row: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, aspectRatio: 1, borderRadius: 12, overflow: 'hidden', borderWidth: 2, borderColor: '#335e87', backgroundColor: '#123861' },
  tileOn: { borderColor: '#4dd3bf', backgroundColor: '#134d69' },
  tileHint: { borderColor: '#ffdf65', borderWidth: 3 },
  pressed: { transform: [{ scale: 0.96 }] },
  hintBadge: { position: 'absolute', right: 3, bottom: 3, width: 18, height: 18, borderRadius: 9, backgroundColor: '#ffdf65', alignItems: 'center', justifyContent: 'center' },
  hintBadgeText: { color: '#163859', fontWeight: '800', fontSize: 14 },
  panelStatus: { fontFamily: 'Knockout', color: '#c9eafa', fontSize: 12, lineHeight: 17, marginTop: 9, textAlign: 'center' },
  success: { marginTop: 11, padding: 11, borderWidth: 2, borderColor: '#ffcc39', borderRadius: 15, backgroundColor: '#fff8db' },
  successTitle: { fontFamily: 'Shark', fontSize: 20, color: '#104e83' },
  successCopy: { fontFamily: 'Knockout', fontSize: 13, lineHeight: 18, color: '#315571', marginTop: 4, marginBottom: 9 },
  primary: { minHeight: 48, backgroundColor: '#ffcd36', borderRadius: 12, borderBottomWidth: 3, borderBottomColor: '#d89b08', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 8 },
  primaryText: { fontFamily: 'Knockout', fontSize: 16, color: '#114578' },
  secondary: { minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  secondaryText: { fontFamily: 'Knockout', fontSize: 15, color: '#075f9f', letterSpacing: 0.3 },
  footer: { fontFamily: 'Knockout', fontSize: 12, lineHeight: 17, color: '#426e87', textAlign: 'center', marginTop: 3 },
  disabled: { opacity: 0.5 },
});
