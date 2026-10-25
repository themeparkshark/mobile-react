/**
 * Signal Repair: a one-thumb circuit puzzle for the queue.
 *
 * Big tiles, one tap turns a tile a quarter clockwise, and a stray bump costs
 * at most three extra taps, so it plays fine while shuffling forward in line.
 * Boards are procedural (see services/lineplay/navigationPanel.ts), 3x3 for a
 * first repair and 4x4 for replays, and dressed per ride theme.
 *
 * Motion: each tile springs through its quarter turn with a little overshoot,
 * the signal then flows tile by tile in the order it reaches them, relay stars
 * pop as they light, and a solved board bursts with particles. Reduced motion
 * gets the same states instantly. Haptic and sound land on the same frame as
 * the visual they belong to.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence,
  withSpring, withTiming } from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import HapticPatterns from '../../../helpers/hapticPatterns';
import { playSfx } from '../../../gamekit/SFX';
import { ParticleField, type ParticleHandle } from '../../../gamekit/Particles';
import { BRAND, GameButton, GameIcon } from '../../../ui';
import { createNavigationPanel, createNavigationPanelProgress, navigationPanelStars, nextNavigationRepair,
  traceNavigationPanel, type NavigationPanelProgress } from '../../../services/lineplay/navigationPanel';
import { circuitThemeFor, type CircuitTheme } from '../../../services/lineplay/circuitTheme';
import { SPACE_NAVIGATOR_ART } from '../spaceNavigatorArt';
import PageScroll from './PageScroll';
import KidText from './KidText';
import { BESIDE_CARD_PAD_V, BESIDE_PANEL_PAD_V, BESIDE_STATUS_ROW, BESIDE_TILE_GAP, BESIDE_V, besideStatusRow, boardBesideDrawn,
  boardSideFor, boardTight, NAV_SETTLE_FADE_MS, NAV_SETTLE_MAX_MS, navBoardLayout, navBoardSettling, navStripHeader,
} from '../../../services/lineplay/lineLayout';

interface Props {
  readonly seed: number;
  readonly progress?: NavigationPanelProgress;
  readonly completed: boolean;
  readonly paused: boolean;
  readonly onTurn: (index: number) => void;
  readonly onNewRound: () => void;
  readonly onNext: () => void;
  /** 'mission' is the chapter's first story mission; 'free' is a free-play round. */
  readonly mode?: 'mission' | 'free';
  readonly theme?: CircuitTheme;
  /** The mission's own name from the chapter (PLAY NOW says the same words); the theme's title otherwise. */
  readonly title?: string;
  /** Label for the next action in free play, e.g. the next page's name. */
  readonly nextLabel?: string;
  /**
   * Details is open. A page too short for the whole board shows one PLAY
   * strip instead of a board with a row peeking under the fade; the tap closes Details.
   */
  readonly onMakeRoom?: () => void;
  /**
   * The page height this board will have once the screen's crew row has lent its room (an iPhone SE
   * sliding to this page). The board is drawn for it from the first frame, so it slides in at its
   * final size while the window grows around it, never a small board that pops.
   */
  readonly targetHeight?: number;
}

const SPACE_SHARK = SPACE_NAVIGATOR_ART;
const TEACHER_SHARK = require('../../../../assets/images/tutorial/teacher-shark.png');
const PORTS = [[1, 50, 0, 'north'], [2, 100, 50, 'east'],
  [4, 50, 100, 'south'], [8, 0, 50, 'west']] as const;
const FLOW_STEP_MS = 55;
/** The board page's header height before it is measured (a tight header is about 64 pt). */
const HEADER_GUESS = 64;

function pipePath(mask: number): string {
  const ports = PORTS.filter(([bit]) => mask & bit);
  if (ports.length < 2) return 'M 50 50 L 50 50';
  return `M ${ports[0][1]} ${ports[0][2]} L 50 50 L ${ports[1][1]} ${ports[1][2]}`;
}

/** One tile's art: the base pipe rotates as a whole, so a tap reads as a real turn. */
function TileArt({ mask, turns, lit, depth, relay, flow, reducedMotion }: {
  mask: number; turns: number; lit: boolean; depth: number; relay: boolean; flow: string; reducedMotion: boolean;
}) {
  const angle = useSharedValue(turns * 90);
  const glow = useSharedValue(lit ? 1 : 0);
  const pop = useSharedValue(1);
  const lastTurns = useRef(turns);
  const total = useRef(turns * 90);

  useEffect(() => {
    // Always spin forward: 3 -> 0 is one more clockwise quarter, never a rewind.
    const step = ((turns - lastTurns.current) % 4 + 4) % 4;
    lastTurns.current = turns;
    if (step === 0) return;
    total.current += step * 90;
    cancelAnimation(angle);
    angle.value = reducedMotion ? total.current
      : withSpring(total.current, { damping: 11, stiffness: 320, mass: 0.6 });
  }, [turns, reducedMotion, angle]);

  useEffect(() => {
    cancelAnimation(glow);
    if (reducedMotion) { glow.value = lit ? 1 : 0; return; }
    glow.value = lit
      ? withDelay(depth * FLOW_STEP_MS, withTiming(1, { duration: 150, easing: Easing.out(Easing.quad) }))
      : withTiming(0, { duration: 120 });
    if (lit && relay) {
      pop.value = withDelay(depth * FLOW_STEP_MS, withSequence(
        withTiming(1.35, { duration: 110 }), withSpring(1, { damping: 9, stiffness: 260 })));
    }
  }, [lit, depth, relay, reducedMotion, glow, pop]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${angle.value}deg` }] }));
  const glowStyle = useAnimatedStyle(() => ({ opacity: glow.value }));
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  const path = pipePath(mask);

  return <View style={StyleSheet.absoluteFill} pointerEvents="none">
    <Animated.View style={[StyleSheet.absoluteFill, glowStyle, { backgroundColor: 'transparent' }]} />
    <Animated.View style={[StyleSheet.absoluteFill, spin]}>
      <Svg width="100%" height="100%" viewBox="0 0 100 100" accessible={false}>
        <Path d={path} stroke={BRAND.navy} strokeWidth={26} fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <Path d={path} stroke={BRAND.sky} strokeWidth={15} fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
      <Animated.View style={[StyleSheet.absoluteFill, glowStyle]}>
        <Svg width="100%" height="100%" viewBox="0 0 100 100" accessible={false}>
          <Path d={path} stroke={flow} strokeWidth={15} fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <Path d={path} stroke={BRAND.white} strokeWidth={4} strokeOpacity={0.85} fill="none"
            strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
      </Animated.View>
    </Animated.View>
    {relay ? <Animated.View style={[styles.relayBadge, popStyle]}>
      <GameIcon name="star" size={30} mono={lit ? undefined : '#9db7cf'} />
    </Animated.View> : <View style={[styles.hub, lit && { backgroundColor: flow }]} />}
  </View>;
}

/**
 * "Turn this tile": a little board tile with a clockwise arrow hugging its corner. It says what a
 * tap does without reading (the round "retry" arrow read as "start over").
 */
function TurnTileGlyph({ size = 22 }: { size?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
    <Rect x={2.5} y={6.5} width={15} height={15} rx={4} fill={BRAND.white} stroke={BRAND.navy} strokeWidth={2.2} />
    <Path d="M 10 21 L 10 14 L 17 14" stroke={BRAND.navy} strokeWidth={5.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M 10 21 L 10 14 L 17 14" stroke={BRAND.sky} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    <Path d="M 9 4 A 11 11 0 0 1 20.5 13" stroke={BRAND.gold} strokeWidth={2.8} fill="none" strokeLinecap="round" />
    <Path d="M 17.6 11.6 L 20.7 14.6 L 22.6 10.8" stroke={BRAND.gold} strokeWidth={2.6} fill="none" strokeLinecap="round" strokeLinejoin="round" />
  </Svg>;
}

/** A short original fiction puzzle; the server's verified wait still owns every reward. */
export default function NavigationPanelCard({ seed, progress: saved, completed, paused, onTurn, onNewRound, onNext,
  mode = 'mission', theme, title: missionTitle, nextLabel, onMakeRoom, targetHeight }: Props) {
  const baseLook = theme ?? circuitThemeFor(undefined, true);
  const look = missionTitle ? { ...baseLook, repairTitle: missionTitle } : baseLook;
  const progress = useMemo(() => saved ?? createNavigationPanelProgress(seed, 0, completed), [seed, saved, completed]);
  const panel = useMemo(() => createNavigationPanel(seed, progress.round), [seed, progress.round]);
  const trace = useMemo(() => traceNavigationPanel(panel, progress.rotations), [panel, progress.rotations]);
  const stars = trace.solved ? navigationPanelStars(seed, progress) : 0;
  const [showHint, setShowHint] = useState(false);
  const [artFailed, setArtFailed] = useState(false);
  const [boardWidth, setBoardWidth] = useState(0);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [headerHeight, setHeaderHeight] = useState(0);
  const reducedMotion = useReducedGameMotion();
  const reveal = useSharedValue(trace.solved ? 1 : 0);
  const shake = useSharedValue(0);
  const particles = useRef<ParticleHandle>(null);
  const scroll = useRef<ScrollView>(null);
  const scrollToPayoff = useRef(false);
  const previousSolved = useRef(trace.solved);
  const previousSignals = useRef(trace.signals);
  const previousRound = useRef(progress.round);
  const hint = showHint ? nextNavigationRepair(panel, progress) : null;
  const locked = paused || trace.solved;
  const space = look.id === 'space';

  useEffect(() => {
    if (previousRound.current !== progress.round) {
      previousRound.current = progress.round;
      previousSignals.current = 0;
      setShowHint(false);
    }
    if (!trace.solved) scrollToPayoff.current = false;
    if (trace.signals > previousSignals.current && !trace.solved) {
      // A new relay lit: a small tick lands with the star pop.
      HapticPatterns.selection(); playSfx('star', 0.5);
    }
    previousSignals.current = trace.signals;
    if (trace.solved && !previousSolved.current) {
      scrollToPayoff.current = true;
      HapticPatterns.success(); playSfx('win');
      if (!reducedMotion && boardWidth > 0) {
        particles.current?.burst({ x: boardWidth / 2, y: boardWidth / 2, preset: 'burst', count: 36,
          colors: [look.flow, BRAND.gold, BRAND.white] });
        particles.current?.burst({ x: boardWidth / 2, y: boardWidth / 3, preset: 'confetti', count: 24 });
      }
      void AccessibilityInfo.announceForAccessibility(
        `${look.solvedTitle} All three ${look.relayNoun} connected. ${stars} of 3 stars.`);
    }
    previousSolved.current = trace.solved;
  }, [progress.round, trace.solved, trace.signals]);

  useEffect(() => {
    cancelAnimation(reveal);
    if (!trace.solved) reveal.value = 0;
    else if (reducedMotion) reveal.value = 1;
    else reveal.value = withDelay(panel.route.length * FLOW_STEP_MS,
      withSpring(1, { damping: 13, stiffness: 190 }));
    return () => cancelAnimation(reveal);
  }, [trace.solved, reducedMotion, reveal, panel.route.length]);

  const revealStyle = useAnimatedStyle(() => ({
    opacity: reveal.value,
    transform: [{ translateY: (1 - reveal.value) * 18 }, { scale: 0.94 + reveal.value * 0.06 }],
  }));
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));

  const turn = (index: number) => {
    if (locked) {
      if (paused && !reducedMotion) {
        // A tap on a paused board says so with a tiny nudge instead of doing nothing.
        shake.value = withSequence(withTiming(-5, { duration: 45 }), withTiming(5, { duration: 70 }),
          withTiming(0, { duration: 45 }));
      }
      return;
    }
    onTurn(index); HapticPatterns.selection(); playSfx('tick', 0.45);
  };

  const size = panel.size;
  // No count here: the STORY rail under the page owns "CLUE 1/3", so a kid sees each count once.
  const kickerText = `${look.place} · SIGNAL REPAIR`;
  const status = paused ? 'Paused. Your circuit is saved.'
    : trace.solved ? `3 / 3 ${look.relayNoun} linked · exit online`
      : hint != null ? 'Turn the gold-edged tile to reconnect the route.'
        : trace.signals === 3 ? `All ${look.relayNoun} linked! Now reach the exit.`
          : trace.signals === 0 && progress.taps === 0
            ? 'Tap a tile to turn it.'
            : `${trace.signals} / 3 ${look.relayNoun} linked · follow the glow`;

  // One thumb, one glance: the whole board and both ports fit above the
  // chapter rail. Size the tiles from the height this page really has.
  // Before the header is measured, assume its usual height, so the first frame already picks the right layout.
  // The room the board is sized for: the page's own size, or the bigger size it is about to grow to.
  // The screen knows the window's new height in the same frame it changes (Details opening or closing,
  // or an SE crew row lending its room), before this page's own measurement arrives: the board lays
  // out for that height at once, so no frame shows the old board cut by a smaller window.
  const growing = targetHeight != null && viewport.height > 0 && Math.abs(targetHeight - viewport.height) > 1;
  const room = growing ? { width: viewport.width, height: targetHeight as number } : viewport;
  const layout = navBoardLayout(room, headerHeight || HEADER_GUESS, !!onMakeRoom);
  const beside = layout === 'beside';
  const tight = beside || boardTight(room.height);
  const boardSide = beside ? boardBesideDrawn(room) : boardSideFor(room, headerHeight);
  // A tight page says what to do in the header's top line (the rail already counts the clue),
  // so nothing is left under the board for the fade to cut.
  const statusOnTop = tight && !trace.solved;
  const kicker = statusOnTop ? status : kickerText;
  const firstTap = !paused && !trace.solved && hint == null && trace.signals === 0 && progress.taps === 0;
  // A beside page has height to spare (a 17 Pro, a Pro Max): what to do gets its own line across the
  // top, so the column only holds the title and neither one wraps.
  const statusRow = beside && besideStatusRow(room);
  // An iPhone SE sliding to this page: the crew row's room arrives a frame or two later. The board
  // stays unseen until it has its final size, then fades in (no small board, no stale arrow).
  const settling = navBoardSettling(layout, room, !!onMakeRoom);
  const [settleWaited, setSettleWaited] = useState(false);
  useEffect(() => {
    if (!settling) return undefined;
    const timer = setTimeout(() => setSettleWaited(true), NAV_SETTLE_MAX_MS);
    return () => clearTimeout(timer);
  }, [settling]);
  const hideBoard = settling && !settleWaited;
  const settleFade = useSharedValue(1);
  const wasHidden = useRef(false);
  useEffect(() => {
    if (hideBoard) {
      cancelAnimation(settleFade);
      settleFade.value = 0;
      wasHidden.current = true;
    } else if (wasHidden.current) {
      wasHidden.current = false;
      settleFade.value = reducedMotion ? 1 : withTiming(1, { duration: NAV_SETTLE_FADE_MS });
    }
  }, [hideBoard, reducedMotion, settleFade]);
  const settleStyle = useAnimatedStyle(() => ({ opacity: settleFade.value }));
  const gap = beside ? BESIDE_TILE_GAP : 6;
  // Each tile's touch area reaches into half the gap, so a finger between two tiles still turns one.
  const tileSlop = gap / 2;
  const onLayout = (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== viewport.width || height !== viewport.height) setViewport({ width, height });
  };

  // Details open on a page too short for a whole board: the mission's header (when it fits) and one
  // PLAY strip, like the chapter's PLAY strip. The tap closes Details so the board has room.
  if (onMakeRoom && layout === 'strip') {
    const title = trace.solved ? look.solvedTitle : look.repairTitle;
    const withHeader = navStripHeader(room.height);
    return <PageScroll fill={BRAND.cream} contentStyle={[styles.contentStrip, withHeader && styles.contentStripHeader]}
      onLayout={onLayout} still>
      {withHeader && <LinearGradient colors={[BRAND.blueBright, BRAND.blue]} style={[styles.hero, styles.heroCompact, styles.heroStrip]}>
        <View style={styles.heroCopy}>
          <KidText style={styles.kicker} numberOfLines={1}>{kickerText}</KidText>
          <View style={styles.titleRow}>
            <Text style={[styles.title, styles.titleCompact]} numberOfLines={1}>{title}</Text>
            <View style={styles.relayRow} accessible accessibilityLabel={`${trace.signals} of 3 ${look.relayNoun} connected`}>
              {[0, 1, 2].map(slot => <GameIcon key={slot} name="star" size={18}
                mono={slot < trace.signals ? undefined : '#8fb9e0'} />)}
            </View>
          </View>
        </View>
      </LinearGradient>}
      {/* PLAY, the same word as the chapter's strip. Paused, it rests in pale blue like the paused
          chapter PLAY and ARCADE, and one tap runs the same 3 2 1 as the play button (never a tap
          that only hides Details while the game stays paused). */}
      <Pressable accessibilityRole="button" onPress={onMakeRoom}
        accessibilityLabel={`${paused ? 'Resume and play' : 'Play'} ${title}. Hides the details.`}
        style={({ pressed }) => [styles.playStrip, !withHeader && styles.playStripFill, paused && styles.playStripResting,
          pressed && !reducedMotion && styles.pressed]}>
        {withHeader ? <Text style={[styles.playStripTitle, styles.playStripCtaBig]}>PLAY</Text> : <>
          <View style={styles.playStripCopy}>
            <Text style={styles.playStripTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
              <Text style={styles.playStripCta}>{'PLAY  '}</Text>{title}
            </Text>
            <View style={styles.relayRow}>
              {[0, 1, 2].map(slot => <GameIcon key={slot} name="star" size={14}
                mono={slot < trace.signals ? undefined : '#9db7cf'} />)}
            </View>
          </View>
        </>}
        <GameIcon name="play" size={40} />
      </Pressable>
    </PageScroll>;
  }

  const success = <Animated.View style={[styles.success, revealStyle]}>
      <View style={styles.starsRow} accessible accessibilityLabel={`${stars} of 3 stars`}>
        {[1, 2, 3].map(slot => <GameIcon key={slot} name="star" size={slot === 2 ? 44 : 36}
          mono={slot <= stars ? undefined : '#cfd9e4'} />)}
      </View>
      <Text style={styles.successTitle}>{mode === 'mission' ? 'First signal found!' : 'Circuit repaired!'}</Text>
      <Text style={styles.successCopy}>{stars === 3 ? 'Perfect repair: not a single wasted turn.'
        : stars === 2 ? 'Clean work. A few extra turns, still a great repair.'
          : 'Repaired! Try another circuit for a cleaner run.'}</Text>
      <GameButton label={mode === 'mission' ? 'SPOT THE CLUE' : (nextLabel ?? 'NEXT ROUND').toUpperCase()}
        icon="arrow" onPress={onNext} disabled={paused} fullWidth
        accessibilityLabel={mode === 'mission' ? 'Next mission: Spot the clue' : `Next: ${nextLabel ?? 'next round'}`} />
      <GameButton label="Try another circuit" variant="ghost" onPress={onNewRound} disabled={paused}
        accessibilityLabel="Play another navigation circuit" />
  </Animated.View>;

  const board = (
    <Animated.View style={[styles.panel, tight && styles.panelTight, beside && styles.panelBeside, shakeStyle]}>
      <View style={[styles.boardFrame, { gap }, boardSide != null && { width: boardSide, maxWidth: boardSide }]}
        onLayout={event => setBoardWidth(event.nativeEvent.layout.width)}>
        <View style={[styles.port, styles.portIn, { top: `${(Math.floor(panel.entry / size) + 0.5) * (100 / size)}%` }]}
          accessible={false} />
        <View style={[styles.port, styles.portOut, trace.reachesExit && { backgroundColor: look.flow },
          { top: `${(Math.floor(panel.exit / size) + 0.5) * (100 / size)}%` }]} accessible={false} />
        {Array.from({ length: size }, (_, row) => <View key={row} style={[styles.row, { gap }]}>
          {Array.from({ length: size }, (_, column) => {
            const index = row * size + column;
            const active = trace.connected.includes(index), relay = panel.relays.includes(index);
            const ports = PORTS.filter(([bit]) => trace.masks[index] & bit);
            return <Pressable key={index} onPress={() => turn(index)} disabled={locked} hitSlop={tileSlop}
              accessibilityRole="button" accessibilityState={{ disabled: locked }}
              accessibilityLabel={`Circuit tile row ${row + 1}, column ${column + 1}. ${ports.map(port => port[3]).join(' to ')}. ${active ? 'Glowing signal' : 'No signal'}${relay ? `, ${look.relayNoun.replace(/s$/, '')} relay` : ''}. Tap to rotate clockwise.`}
              style={({ pressed }) => [styles.tile, active && { backgroundColor: look.litTile, borderColor: look.flow },
                hint === index && styles.tileHint, pressed && !reducedMotion && styles.pressed]}>
              <TileArt mask={panel.masks[index]} turns={progress.rotations[index] ?? 0} lit={active}
                depth={trace.depth[index] ?? 0} relay={relay} flow={look.flow} reducedMotion={reducedMotion} />
              {hint === index && <View style={styles.hintBadge}><TurnTileGlyph size={18} /></View>}
            </Pressable>;
          })}
        </View>)}
        <ParticleField ref={particles} width={boardWidth} height={boardWidth} style={styles.particles} />
      </View>
      {!statusOnTop && <View style={[styles.statusRow, tight && styles.statusRowTight]}>
        {firstTap && <TurnTileGlyph />}
        <Text style={[styles.panelStatus, tight && styles.panelStatusTight]} accessibilityLiveRegion="polite">{status}</Text>
      </View>}
    </Animated.View>
  );

  const hintButton = <Pressable style={[styles.hintButton, beside && styles.hintButtonBeside, showHint && styles.hintButtonOn]} disabled={locked}
    onPress={() => setShowHint(value => !value)} accessibilityRole="button"
    accessibilityLabel={showHint ? 'Hide the circuit clue' : 'Show a clue for this circuit'}
    accessibilityHint={`Tap a tile to turn it. Link all three ${look.relayNoun} to the exit.`}
    accessibilityState={{ disabled: locked, expanded: showHint }} hitSlop={6}>
    {/* The same "turn this tile" picture the hinted tile wears, never the magnifier: on this page the
        rail's "Next: Spot the clue" owns the magnifier, so each picture means one thing. The little
        "?" badge makes it help ("show me which tile"), so it never reads as the instruction picture. */}
    <TurnTileGlyph size={beside ? 22 : 26} />
    <View style={[styles.helpBadge, beside && styles.helpBadgeBeside]} pointerEvents="none">
      <Text style={[styles.helpBadgeText, beside && styles.helpBadgeTextBeside]} accessible={false}>?</Text>
    </View>
  </Pressable>;
  const relayStars = (starSize: number) => <View style={styles.relayRow} accessible
    accessibilityLabel={`${trace.signals} of 3 ${look.relayNoun} connected, ${panel.name}, ${size} by ${size}`}>
    {[0, 1, 2].map(slot => <GameIcon key={slot} name="star" size={starSize}
      mono={slot < trace.signals ? undefined : '#8fb9e0'} />)}
  </View>;
  const scrollPayoff = () => {
    if (!scrollToPayoff.current || !scroll.current) return;
    scrollToPayoff.current = false;
    scroll.current.scrollToEnd({ animated: !reducedMotion });
  };

  // A short page (an iPhone SE, or a 17 Pro reading Details): the header is a column BESIDE the board,
  // so the whole puzzle and both ports fit the page's height with no scrolling. What to do sits on top
  // of the column, the stars and the clue button at its foot. A solved board's payoff is below.
  if (beside) {
    // Centered: a page taller than the board keeps even room above and below it.
    const rowAbove = statusRow ? BESIDE_STATUS_ROW : 0;
    const besideTop = Math.max(BESIDE_CARD_PAD_V,
      Math.floor((room.height - rowAbove - (boardSide ?? 0) - BESIDE_V) / 2) + BESIDE_CARD_PAD_V);
    const besideTitle = trace.solved ? look.solvedTitle : look.repairTitle;
    // A short title ("Fix the signal") stays on one line; a long one may take two.
    const titleLines = besideTitle.length <= 15 ? 1 : 2;
    // In the narrow column the first instruction breaks evenly ("Tap a tile / to turn it."), never a lone "it.".
    const columnStatus = status === 'Tap a tile to turn it.' ? 'Tap a tile\nto turn it.' : status;
    const statusLine = <View style={[styles.statusTop, statusRow && styles.statusRowAbove]} accessibilityLiveRegion="polite">
      {firstTap && <TurnTileGlyph size={20} />}
      <KidText style={[styles.kicker, styles.kickerStatus, styles.kickerBeside, statusRow && styles.kickerOnCream]}
        numberOfLines={statusRow ? 1 : 2} adjustsFontSizeToFit={statusRow} minimumFontScale={0.85}>
        {trace.solved ? kickerText : statusRow ? status : columnStatus}</KidText>
    </View>;
    // While the window grows to the board, no "more below" arrow points at the part still arriving.
    return <PageScroll ref={scroll} fill={BRAND.cream} still={hideBoard || growing}
      contentStyle={[styles.cardBeside, { paddingTop: besideTop }]} onLayout={onLayout}
      onContentSizeChange={scrollPayoff}>
      <View style={hideBoard && styles.unmeasured}>
      <Animated.View style={settleStyle}>
      {statusRow && statusLine}
      <View style={styles.besideRow}>
        <LinearGradient colors={[BRAND.blueBright, BRAND.blue]} style={[styles.hero, styles.heroBeside,
          statusRow && styles.heroBesideRoomy]}>
          {!statusRow && statusLine}
          <Text style={[styles.title, styles.titleCompact, styles.titleBeside]} numberOfLines={titleLines}
            adjustsFontSizeToFit={titleLines === 1} minimumFontScale={0.75}>{besideTitle}</Text>
          <View style={styles.besideFoot}>
            {relayStars(18)}
            {!trace.solved && hintButton}
          </View>
        </LinearGradient>
        {board}
      </View>
      </Animated.View>
      </View>
      {trace.solved ? success : null}
    </PageScroll>;
  }

  // Not measured yet: the content is invisible for that one layout pass, so the board never
  // flashes in the wrong layout before it picks beside or top.
  return <PageScroll ref={scroll} fill={BRAND.cream}
    contentStyle={[styles.card, tight && styles.cardTight, viewport.height <= 0 && styles.unmeasured]}
    onLayout={onLayout}
    onContentSizeChange={scrollPayoff}>
    <View onLayout={event => setHeaderHeight(event.nativeEvent.layout.height)}>
      <LinearGradient colors={[BRAND.blueBright, BRAND.blue]}
        style={[styles.hero, !trace.solved && styles.heroCompact]}>
        <View style={styles.heroCopy}>
          {statusOnTop ? <View style={styles.statusTop} accessibilityLiveRegion="polite">
            {firstTap && <TurnTileGlyph size={20} />}
            <KidText style={[styles.kicker, styles.kickerStatus]} numberOfLines={1} adjustsFontSizeToFit
              minimumFontScale={0.8}>{kicker}</KidText>
          </View> : <KidText style={styles.kicker} numberOfLines={1}>{kicker}</KidText>}
          <View style={styles.titleRow}>
            <Text style={[styles.title, !trace.solved && styles.titleCompact]} numberOfLines={1}>
              {trace.solved ? look.solvedTitle : look.repairTitle}</Text>
            {relayStars(trace.solved ? 22 : 18)}
          </View>
        </View>
        {trace.solved ? <Image source={space && !artFailed ? SPACE_SHARK : TEACHER_SHARK}
          onError={() => setArtFailed(true)} style={styles.shark} contentFit="contain"
          accessibilityLabel="Your shark cheers the repaired circuit" /> : hintButton}
      </LinearGradient>
    </View>

    {board}

    {trace.solved ? success : null}
    {!tight && <Text style={styles.footer}>Play solo or pass the phone. Keep walking with the line; your circuit stays saved.</Text>}
  </PageScroll>;
}


const styles = StyleSheet.create({
  card: { padding: 12, paddingBottom: 12 },
  cardTight: { padding: 8, paddingBottom: 10 },
  unmeasured: { opacity: 0 },
  hero: { minHeight: 92, borderRadius: 16, flexDirection: 'row', alignItems: 'center', overflow: 'hidden',
    paddingLeft: 14, borderWidth: 3, borderColor: BRAND.navy },
  heroCompact: { minHeight: 0, paddingRight: 8 },
  heroCopy: { flex: 1, zIndex: 1, paddingVertical: 8 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  titleCompact: { fontSize: 19, lineHeight: 23, flexShrink: 1 },
  kicker: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.goldLight, letterSpacing: 0.8 },
  title: { fontFamily: 'Shark', fontSize: 23, lineHeight: 27, color: BRAND.white, marginTop: 3,
    textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  relayRow: { flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 3 },
  shark: { width: 84, height: 92, marginRight: -6, alignSelf: 'flex-end' },
  hintButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: BRAND.gold, alignItems: 'center',
    justifyContent: 'center', borderWidth: 3, borderColor: BRAND.navy, borderBottomWidth: 5 },
  hintButtonOn: { backgroundColor: BRAND.goldLight, borderBottomWidth: 3 },
  // The help mark: a small navy "?" bubble on the hint button's corner.
  helpBadge: { position: 'absolute', top: -7, right: -7, width: 20, height: 20, borderRadius: 10,
    backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  helpBadgeBeside: { top: -6, right: -6, width: 18, height: 18, borderRadius: 9 },
  helpBadgeText: { fontFamily: 'Shark', fontSize: 13, lineHeight: 15, color: BRAND.goldLight, marginTop: 2 },
  helpBadgeTextBeside: { fontSize: 12, lineHeight: 14 },
  panel: { marginTop: 10, backgroundColor: BRAND.blueBright, borderRadius: 20, borderWidth: 3, borderColor: BRAND.navy,
    paddingVertical: 12, paddingHorizontal: 22 },
  panelTight: { marginTop: 6, paddingVertical: 6 },
  boardFrame: { gap: 6, width: '100%', maxWidth: 300, alignSelf: 'center' },
  row: { flexDirection: 'row', gap: 6 },
  tile: { flex: 1, aspectRatio: 1, borderRadius: 14, overflow: 'hidden', borderWidth: 3, borderColor: BRAND.navy,
    backgroundColor: BRAND.white },
  tileHint: { borderColor: BRAND.gold, borderWidth: 4 },
  pressed: { transform: [{ scale: 0.94 }] },
  hub: { position: 'absolute', left: '50%', top: '50%', width: 14, height: 14, marginLeft: -7, marginTop: -7,
    borderRadius: 7, backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.navy },
  relayBadge: { position: 'absolute', left: '50%', top: '50%', marginLeft: -15, marginTop: -15 },
  port: { position: 'absolute', width: 16, height: 26, marginTop: -13, borderRadius: 6, borderWidth: 3,
    borderColor: BRAND.navy, backgroundColor: BRAND.gold },
  portIn: { left: -19 },
  portOut: { right: -19, backgroundColor: BRAND.sky },
  hintBadge: { position: 'absolute', right: 2, bottom: 2, width: 22, height: 22, borderRadius: 11,
    backgroundColor: BRAND.gold, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: BRAND.navy },
  particles: { position: 'absolute', left: 0, top: 0 },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: 11 },
  statusRowTight: { marginTop: 6 },
  panelStatus: { flexShrink: 1, fontFamily: 'Knockout', color: BRAND.white, fontSize: 15, lineHeight: 19,
    textAlign: 'center' },
  panelStatusTight: { fontSize: 14, lineHeight: 17 },
  // A tight page: the status takes the kicker's line in the header (white, easy to read).
  statusTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  kickerStatus: { flexShrink: 1, color: BRAND.white, fontSize: 14, letterSpacing: 0.2 },
  // Beside: the header is a column left of the board (a short page).
  cardBeside: { paddingHorizontal: 8, paddingBottom: BESIDE_CARD_PAD_V },
  besideRow: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  heroBeside: { flex: 1, minHeight: 0, flexDirection: 'column', alignItems: 'stretch', justifyContent: 'space-between',
    paddingLeft: 10, paddingRight: 6, paddingVertical: 6 },
  hintButtonBeside: { width: 36, height: 36, borderRadius: 18, borderBottomWidth: 4 },
  kickerBeside: { fontSize: 14, lineHeight: 17 },
  titleBeside: { fontSize: 18, lineHeight: 21, marginTop: 2 },
  besideFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  panelBeside: { marginTop: 0, alignSelf: 'flex-start', justifyContent: 'center', paddingVertical: BESIDE_PANEL_PAD_V },
  // The status line across the top of a roomy beside page: navy on the cream page, one line.
  statusRowAbove: { height: BESIDE_STATUS_ROW, justifyContent: 'center', paddingHorizontal: 2 },
  kickerOnCream: { color: BRAND.navy, fontSize: 15, lineHeight: 19 },
  heroBesideRoomy: { justifyContent: 'center', gap: 10 },
  // The one-row PLAY strip (Details open on a short page).
  contentStrip: { flexGrow: 1, justifyContent: 'center', padding: 5, paddingBottom: 5 },
  playStrip: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingLeft: 12, paddingRight: 4,
    paddingVertical: 1, borderRadius: 16, borderWidth: 3, borderColor: BRAND.navy, borderBottomWidth: 5,
    backgroundColor: BRAND.gold },
  playStripCopy: { flex: 1 },
  // No header above it (an iPhone SE reading Details): the strip fills its window, no empty cream band.
  playStripFill: { flexGrow: 1, maxHeight: 112 },
  contentStripHeader: { gap: 8, padding: 8, paddingBottom: 8 },
  heroStrip: { minHeight: 0 },
  playStripCtaBig: { flex: 1, fontSize: 20 },
  playStripTitle: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 18, lineHeight: 22 },
  playStripCta: { color: '#7c4200', fontFamily: 'Knockout', fontSize: 14, letterSpacing: 0.8 },
  // Paused: the strip rests like the paused chapter PLAY (pale blue, navy outline), still live.
  playStripResting: { backgroundColor: '#e8f6ff', borderColor: '#0b4f8a' },
  success: { marginTop: 12, padding: 12, borderWidth: 3, borderColor: BRAND.gold, borderRadius: 18,
    backgroundColor: BRAND.white, alignItems: 'center', gap: 4 },
  starsRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 2 },
  successTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, textAlign: 'center' },
  successCopy: { fontFamily: 'Knockout', fontSize: 15, lineHeight: 19, color: BRAND.navySoft, marginBottom: 6,
    textAlign: 'center' },
  footer: { fontFamily: 'Knockout', fontSize: 13, lineHeight: 17, color: BRAND.navySoft, textAlign: 'center',
    marginTop: 8 },
});
