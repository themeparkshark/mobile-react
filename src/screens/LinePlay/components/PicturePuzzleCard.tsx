/**
 * Line story picture puzzles (fix pass w4, T075): the story's clue 1 (a picture row with a gap) and clue 2
 * (find the twin) as ten-second games a seven-year-old plays with taps on pictures and zero reading. The
 * pictures are Alex's illustrated card faces for the ride's land (games/memory/decks.ts); the gap is the
 * memory card back. No timer and no countdown: a wrong tap wobbles and rests, the right tap pops.
 *
 * Solved, the page shows this ride's own checked fact under FAN FACT (only a real ride fact ever wears that
 * label) and a small Play again.
 *
 * Motion: springs on the UI thread (Reanimated), nothing loops while idle except one soft glow on the gap,
 * and Reduce Motion shows every state with no movement.
 */
import { useContext, useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Image, Pressable, StyleSheet, Text, View, type ImageSourcePropType, type LayoutChangeEvent } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withSpring, withTiming,
  Easing } from 'react-native-reanimated';
import { deckById, type Deck } from '../../../games/memory/decks';
import { BRAND, GameButton, GameIcon } from '../../../ui';
import { SPRING } from '../../../ui/motion';
import useUiReducedMotion from '../../../ui/useUiReducedMotion';
import HapticPatterns from '../../../helpers/hapticPatterns';
import { studioMoment } from '../../../gamekit/audio/playMoment';
import { factSourceLine } from '../../../services/lineplay/labels';
import { patternRound, patternTapRight, puzzleRounds, twinRound, twinTapRight, type PicturePuzzleKind,
} from '../../../services/lineplay/picturePuzzle';
import { PageHeightContext } from './PageScroll';
import ClueDots from './ClueDots';

const CARD_BACK: ImageSourcePropType = require('../../../assets/games/memory/card-back.png');
/** Card faces are 3 wide by 4 tall on Alex's sheets. */
const FACE_RATIO = 4 / 3;
/** How far inside each sheet cell the crop sits (a share of the cell). */
const FACE_INSET = 0.02;

interface Props {
  readonly kind: PicturePuzzleKind;
  /** The picture deck (the ride's land deck); an unknown id falls back to the park deck. */
  readonly deckId?: string;
  readonly seed: number;
  /** The clue's mission name ("Fix the star chart row"), for VoiceOver and readers. */
  readonly title?: string;
  readonly completed: boolean;
  readonly paused: boolean;
  /** This ride's own checked fact, shown once solved; null shows none (never a made-up fact). */
  readonly fact?: string | null;
  readonly factSource?: string | null;
  readonly onSolved: () => void;
}

/** One illustrated card face, cropped from its deck sheet. */
function Face({ deck, symbol, width }: { deck: Deck; symbol: number; width: number }) {
  const sym = deck.symbols[symbol];
  const height = Math.round(width * FACE_RATIO);
  if (!sym) return <View style={{ width, height }} />;
  const extra = sym.extraSheetSlot != null;
  const sheet = extra ? deck.extraFaceSheet : deck.faceSheet;
  const cols = extra ? 2 : 4;
  const rows = extra ? 1 : 2;
  const slot = extra ? sym.extraSheetSlot! : sym.sheetSlot ?? 0;
  if (!sheet) return <View style={[styles.faceFallback, { width, height, backgroundColor: sym.tint }]} />;
  // The sheet's cells touch, so a plain crop shows a sliver of the next card: crop a little inside the cell.
  const cellW = width / (1 - 2 * FACE_INSET);
  const cellH = height / (1 - 2 * FACE_INSET);
  return <View style={[styles.faceClip, { width, height }]}>
    <Image source={sheet} resizeMode="stretch" fadeDuration={0} style={{ position: 'absolute', width: cellW * cols, height: cellH * rows,
      left: -(slot % cols) * cellW - FACE_INSET * cellW, top: -Math.floor(slot / cols) * cellH - FACE_INSET * cellH }} />
  </View>;
}

function faceLabel(deck: Deck, symbol: number): string {
  return deck.symbols[symbol]?.id.split('-').slice(1).join(' ') || 'picture';
}

/** A tappable picture: pops when right, wobbles and rests when wrong. */
function PictureTile({ deck, symbol, width, state, disabled, reduced, onPress }: {
  deck: Deck; symbol: number; width: number; state: 'idle' | 'right' | 'wrong'; disabled: boolean; reduced: boolean;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);
  const turn = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    if (state === 'right') scale.value = withSequence(withSpring(1.14, SPRING.stamp), withSpring(1, SPRING.settle));
    if (state === 'wrong') turn.value = withSequence(withTiming(-7, { duration: 60, easing: Easing.out(Easing.quad) }),
      withTiming(7, { duration: 80, easing: Easing.inOut(Easing.quad) }), withSpring(0, SPRING.settle));
  }, [state, reduced, scale, turn]);
  const motion = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }, { rotate: `${turn.value}deg` }] }));
  return <Pressable accessibilityRole="button" accessibilityLabel={faceLabel(deck, symbol)}
    accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [pressed && !disabled && styles.pressed]}>
    <Animated.View style={[styles.tile, state === 'right' && styles.tileRight, state === 'wrong' && styles.tileWrong, motion]}>
      <Face deck={deck} symbol={symbol} width={width} />
      {state === 'right' && <View style={styles.checkBadge}><GameIcon name="check" size={Math.max(18, Math.round(width * 0.32))} /></View>}
    </Animated.View>
  </Pressable>;
}

/** The pattern's gap: the card back, softly glowing until it is filled. */
function GapCard({ width, reduced, filled }: { width: number; reduced: boolean; filled: boolean }) {
  const glow = useSharedValue(0);
  useEffect(() => {
    if (reduced || filled) { cancelAnimation(glow); glow.value = 0; return undefined; }
    glow.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.quad) }), -1, true);
    return () => cancelAnimation(glow);
  }, [reduced, filled, glow]);
  const ring = useAnimatedStyle(() => ({ opacity: 0.35 + glow.value * 0.65, transform: [{ scale: 1 + glow.value * 0.04 }] }));
  const height = Math.round(width * FACE_RATIO);
  return <View accessible accessibilityLabel="The missing picture" style={{ width, height }}>
    <Animated.View pointerEvents="none" style={[styles.gapGlow, { borderRadius: width * 0.16 }, ring]} />
    <Image source={CARD_BACK} resizeMode="contain" style={{ width, height }} />
  </View>;
}

export default function PicturePuzzleCard({ kind, deckId, seed, title, completed, paused, fact = null, factSource = null, onSolved }: Props) {
  const deck = deckById(deckId) ?? deckById('park')!;
  const reduced = useUiReducedMotion();
  const pageHeight = useContext(PageHeightContext);
  const [width, setWidth] = useState(0);
  // A replay deals a fresh puzzle on the same page.
  const [replay, setReplay] = useState(0);
  const [round, setRound] = useState(0);
  const [wrong, setWrong] = useState<readonly number[]>([]);
  const [right, setRight] = useState<number | null>(null);
  const rounds = puzzleRounds(kind);
  const [solvedHere, setSolvedHere] = useState(false);
  const showSolved = solvedHere || (completed && replay === 0 && round === 0 && right == null);
  const dealSeed = seed + replay * 7907;
  const pattern = useMemo(() => kind === 'pattern' ? patternRound(dealSeed, Math.min(round, rounds - 1), deck.symbols.length) : null,
    [kind, dealSeed, round, rounds, deck.symbols.length]);
  const twin = useMemo(() => kind === 'twin' ? twinRound(dealSeed, Math.min(round, rounds - 1), deck.symbols.length) : null,
    [kind, dealSeed, round, rounds, deck.symbols.length]);

  useEffect(() => { setWrong([]); setRight(null); }, [round, replay]);

  // Sizes come from the page's real width and height, so a whole round fits the first screen on every phone.
  const usable = Math.max(0, width);
  const tall = pageHeight > 0 ? pageHeight : 360;
  const rowTile = Math.floor(Math.min(64, (usable - 5 * 6) / 6));
  const choiceTile = Math.floor(Math.min(92, (usable - 2 * 14) / 3, (tall - 96 - rowTile * FACE_RATIO) / FACE_RATIO));
  // The twin row: the target (1.25 tiles plus its 14 pt frame), the 30 pt arrow, the gaps, then three grid tiles.
  const gridTile = Math.floor(Math.min(74, (usable - 72) / 4.25, (tall - 72) / (2 * FACE_RATIO) - 6));
  const targetTile = Math.floor(gridTile * 1.25);

  const tap = (symbol: number) => {
    if (paused || right != null || showSolved) return;
    const ok = kind === 'pattern' ? patternTapRight(pattern!, symbol) : twinTapRight(twin!, symbol);
    if (!ok) {
      setWrong(list => list.includes(symbol) ? list : [...list, symbol]);
      HapticPatterns.selection();
      studioMoment('game.nearMiss', { volume: 0.6 });
      return;
    }
    setRight(symbol);
    HapticPatterns.success();
    studioMoment('game.correct');
    const last = round + 1 >= rounds;
    if (last) void AccessibilityInfo.announceForAccessibility('Solved!');
    setTimeout(() => {
      if (last) {
        setSolvedHere(true);
        if (!completed) onSolved();
      } else {
        setRound(value => value + 1);
      }
    }, reduced ? 250 : 650);
  };

  const again = () => { setSolvedHere(false); setRound(0); setReplay(value => value + 1); };
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };
  const doneDots = Array.from({ length: rounds }, (_, index) => showSolved || index < round || (index === round && right != null));

  return <View onLayout={onLayout} style={styles.root} accessibilityLabel={title}>
    <View style={styles.topRow}>
      <GameIcon name={kind === 'pattern' ? 'sparkle' : 'search'} size={26} />
      {title ? <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{title}</Text> : <View style={styles.flex} />}
      <ClueDots size={14} current={showSolved ? -1 : round} done={doneDots} accessibilityLabel={`${doneDots.filter(Boolean).length} of ${rounds} solved`} />
    </View>
    {width > 0 && !showSolved && kind === 'pattern' && pattern && <View>
      <View style={styles.row} accessibilityLabel="Picture row">
        {pattern.row.map((symbol, index) => <View key={`${replay}-${round}-${index}`} style={styles.rowTile}>
          <Face deck={deck} symbol={symbol} width={rowTile} /></View>)}
        {right != null ? <View style={[styles.rowTile, styles.tileRight]}><Face deck={deck} symbol={right} width={rowTile} /></View>
          : <GapCard width={rowTile} reduced={reduced} filled={false} />}
      </View>
      <View style={styles.pointer}><GameIcon name="arrow" size={22} style={styles.arrowUp} /></View>
      <View style={styles.choices}>
        {pattern.choices.map(symbol => <PictureTile key={`${replay}-${round}-${symbol}`} deck={deck} symbol={symbol} width={choiceTile}
          state={right === symbol ? 'right' : wrong.includes(symbol) ? 'wrong' : 'idle'} reduced={reduced}
          disabled={paused || right != null || wrong.includes(symbol)} onPress={() => tap(symbol)} />)}
      </View>
    </View>}
    {width > 0 && !showSolved && kind === 'twin' && twin && <View style={styles.twinStage}>
      <View style={styles.target} accessible accessibilityLabel={`Find this picture: ${faceLabel(deck, twin.target)}`}>
        <View style={styles.targetFrame}><Face deck={deck} symbol={twin.target} width={targetTile} /></View>
        <GameIcon name="arrow" size={26} style={styles.arrowRight} />
      </View>
      <View style={[styles.grid, { width: gridTile * 3 + 16 }]}>
        {twin.grid.map(symbol => <PictureTile key={`${replay}-${round}-${symbol}`} deck={deck} symbol={symbol} width={gridTile}
          state={right === symbol ? 'right' : wrong.includes(symbol) ? 'wrong' : 'idle'} reduced={reduced}
          disabled={paused || right != null || wrong.includes(symbol)} onPress={() => tap(symbol)} />)}
      </View>
    </View>}
    {showSolved && <View style={styles.solved}>
      <View style={styles.solvedBadge} accessible accessibilityLabel="Solved">
        <GameIcon name="check" size={44} />
        <Text style={styles.solvedText}>Solved!</Text>
      </View>
      {fact ? <View style={styles.factBox}>
        <Text style={styles.factKicker}>FAN FACT</Text>
        <Text style={styles.factText}>{fact}</Text>
        {factSourceLine(factSource) ? <Text style={styles.factSource}>{factSourceLine(factSource)}</Text> : null}
      </View> : null}
      {/* Quiet: the rail's Next is the one big step after a solve. */}
      <GameButton label="Play again" icon="retry" variant="ghost" size="compact" disabled={paused} onPress={again}
        accessibilityLabel={`Play ${title ?? 'this puzzle'} again`} />
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  root: { paddingTop: 4 },
  flex: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { flex: 1, color: BRAND.navy, fontFamily: 'Shark', fontSize: 17, lineHeight: 21 },
  row: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  rowTile: { borderRadius: 10, overflow: 'hidden' },
  pointer: { alignItems: 'flex-end', paddingRight: 18, height: 22, marginTop: 2 },
  arrowUp: { transform: [{ rotate: '-90deg' }] },
  arrowRight: { marginLeft: 4 },
  choices: { flexDirection: 'row', justifyContent: 'center', gap: 14, marginTop: 6 },
  tile: { borderRadius: 12, overflow: 'visible' },
  tileRight: { shadowColor: BRAND.gold, shadowOpacity: 0.9, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  tileWrong: { opacity: 0.4 },
  faceClip: { overflow: 'hidden', borderRadius: 10 },
  faceFallback: { borderRadius: 10, borderWidth: 3, borderColor: BRAND.gold },
  checkBadge: { position: 'absolute', right: -6, top: -6, backgroundColor: BRAND.white, borderRadius: 20, borderWidth: 2,
    borderColor: BRAND.navy, padding: 2 },
  gapGlow: { position: 'absolute', left: -4, right: -4, top: -4, bottom: -4, borderWidth: 4, borderColor: BRAND.gold },
  twinStage: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  target: { flexDirection: 'row', alignItems: 'center' },
  targetFrame: { padding: 4, borderRadius: 14, backgroundColor: BRAND.gold, borderWidth: 3, borderColor: BRAND.navy },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pressed: { transform: [{ scale: 0.95 }] },
  solved: { alignItems: 'center', gap: 10, paddingTop: 4 },
  solvedBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  solvedText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 24 },
  factBox: { alignSelf: 'stretch', padding: 12, borderRadius: 14, borderWidth: 2, borderColor: '#ffca30', backgroundColor: '#fff6d0' },
  factKicker: { color: '#a86500', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 0.6 },
  factText: { color: '#153e67', fontFamily: 'Knockout', fontSize: 15, lineHeight: 20, marginTop: 4 },
  factSource: { color: '#5b7896', fontFamily: 'Knockout', fontSize: 12, marginTop: 4 },
});
