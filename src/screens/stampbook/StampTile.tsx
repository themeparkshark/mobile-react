/**
 * One stamp slot on a passport page (Stamp Book v3). Five states, each with
 * its own shape, so they read in grayscale and at thumbnail size:
 *
 *  - Owned: a white sticker card pressed onto the page, full-colour art, a
 *    rarity-coloured rim and lip, a passport postmark with the date.
 *  - Claim: the owned card with a thick gold rim, a pulsing gold glow and a
 *    bobbing red CLAIM tag. The loudest thing on the page.
 *  - Progress: an empty, recessed paper slot with a dashed edge, the navy ghost
 *    of the art, a progress ring around it and a "14/25" bar with the action
 *    pictogram. "Almost!" from 80%.
 *  - Fresh (not started): the same slot, fainter ghost, a lock and "0/25".
 *  - Secret: the slot with a gold "?" seal.
 *
 * Stamps that give a title wear a gold crown badge in the top-right corner.
 * Tiles never re-render when the card opens or the page scrolls: all motion
 * reads shared values from BookFx on the UI thread.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import type { ReactNode } from 'react';
import { stampRarity } from './rarity';
import GameIcon from '../../ui/GameIcon';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { useBookFx, useTileClock } from './BookFx';
import Foil from './Foil';
import StampArt from './StampArt';
import { almostThere, hasShine, postmark, progressLabel, rarityRank, requirement, ring as ringGeo, stampState, tileLabel, type BookStamp, type Corner } from './model';

export const INK = '#14213D';
export const LIP = '#B98F45';
/** Passport paper: the page, and the darker recessed slot an unearned stamp waits in. */
export const PAPER = '#FFF6DE';
export const SLOT = '#F1E3BF';
export const SLOT_EDGE = '#C9AE78';
export const MUTED_INK = '#5B6782';
const GOLD = '#FFC21A';

interface Props {
  readonly stamp: BookStamp;
  readonly size: number;
  readonly height: number;
  readonly accent: string;
  readonly col: number;
  readonly isNew: boolean;
  /** The section grid's top in scroll-content coordinates (for on-screen gating). */
  readonly gridTop: SharedValue<number>;
  readonly onPress: (stamp: BookStamp) => void;
}

function StampTile({ stamp, size, height, accent, col, isNew, gridTop, onPress }: Props) {
  const fx = useBookFx();
  const press = useSharedValue(1);
  const localY = useSharedValue(0);
  const look = stampRarity(stamp.rarity);
  const state = stampState(stamp);
  const card = state === 'owned' || state === 'claim';
  const art = Math.round(size * 0.66);
  const req = requirement(stamp);
  const almost = almostThere(stamp);
  const mark = stamp.earned ? postmark(stamp.earnedAt) : null;
  const hasTitle = !!stamp.rewards?.title && !stamp.secret;

  const top = useDerivedValue(() => gridTop.value + localY.value);
  const shine = useTileClock(fx.shine, top, height, 1);
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const rank = rarityRank(stamp.rarity);

  const onLayout = (e: LayoutChangeEvent) => { localY.value = e.nativeEvent.layout.y; };
  const tag = state === 'claim' ? 'claim' : isNew && stamp.earned ? 'new' : almost ? 'almost' : null;

  return (
    <Animated.View style={[{ width: size, height }, pressStyle]} onLayout={onLayout}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${tileLabel(stamp)}${hasTitle ? ` Gives the title ${stamp.rewards.title}.` : ''}`}
        onPressIn={() => { press.value = withSpring(0.93, { damping: 14, stiffness: 420 }); }}
        onPressOut={() => { press.value = withSpring(1, { damping: 9, stiffness: 320 }); }}
        onPress={() => { playSfx('ui.tap'); haptic('tapLight'); onPress(stamp); }}
        style={styles.fill}
      >
        {card ? (
          <>
            {state === 'claim' && !fx.reducedMotion && (
              <Pulsing top={top} height={height} kind="glow"><View style={styles.claimGlowFill} /></Pulsing>
            )}
            <View style={[styles.lip, { backgroundColor: state === 'claim' ? '#C98A00' : rank > 1 ? look.lip : LIP }]} />
            <View style={[styles.card, { borderColor: state === 'claim' ? GOLD : look.frame }, state === 'claim' && styles.cardClaim]}>
              <LinearGradient colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']} style={styles.gloss} />
              <View style={[styles.artWrap, { width: art, height: art }]}>
                <StampArt stamp={stamp} size="thumb" placeholder={accent} priority={col < 3 ? 'high' : 'normal'} />
                {hasShine(stamp) && !fx.reducedMotion && (
                  <Foil stamp={stamp} size={art} art="thumb" progress={shine} lag={col * 0.08} />
                )}
                {!!mark && (
                  <View style={[styles.postmark, CORNER[postmarkCorner(stamp.freeCorner, !!tag)]]} accessible={false}>
                    <Text style={styles.pmMonth} maxFontSizeMultiplier={1}>{mark.month}</Text>
                    <Text style={styles.pmDay} maxFontSizeMultiplier={1}>{mark.day}</Text>
                  </View>
                )}
              </View>
              <Text style={styles.name} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}
                maxFontSizeMultiplier={1.3}>{stamp.shortName}</Text>
            </View>
          </>
        ) : (
          <View style={[styles.slot, state === 'secret' && styles.slotSecret]}>
            <View style={[styles.artWrap, { width: art, height: art }]}>
              {state === 'secret' ? (
                <View style={styles.secret}><Text style={styles.secretMark} maxFontSizeMultiplier={1}>?</Text></View>
              ) : (
                <>
                  <View style={[styles.ghost, state === 'fresh' && styles.ghostFresh]}>
                    <StampArt stamp={stamp} size="thumb" priority={col < 3 ? 'high' : 'normal'} />
                  </View>
                  <ProgressRing size={art} fraction={stamp.percent / 100} color={accent} />
                  {state === 'fresh' && <View style={styles.lock}><GameIcon name="lock" size={13} /></View>}
                </>
              )}
            </View>
            <Text style={[styles.name, styles.nameSlot]} numberOfLines={state === 'secret' ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.8}
              maxFontSizeMultiplier={1.3}>{state === 'secret' ? 'Secret' : stamp.shortName}</Text>
            {state !== 'secret' && (req.pips ? (
              <View style={styles.reqRow}>
                <GameIcon name={req.icon} size={15} />
                <View style={styles.pips}>
                  {Array.from({ length: stamp.target }, (_, i) => (
                    <View key={i} style={[styles.pip, { backgroundColor: i < stamp.progress ? accent : 'rgba(20,33,61,0.12)',
                      width: Math.max(4, Math.min(8, (size - 40) / stamp.target - 2)) }]} />
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.reqRow}>
                <GameIcon name={req.icon} size={15} />
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${Math.max(stamp.percent, 0)}%`, backgroundColor: accent }]} />
                  <Text style={styles.barText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.2}>{progressLabel(stamp)}</Text>
                </View>
              </View>
            ))}
            {state === 'secret' && <Text style={styles.secretHint} numberOfLines={1} maxFontSizeMultiplier={1.2}>Keep playing!</Text>}
          </View>
        )}

        {/* Rarity gems (1 to 5): the shape cue that works without colour. */}
        {state !== 'secret' && (
          <View style={styles.gems} accessible={false}>
            {Array.from({ length: look.gems }, (_, i) => (
              <View key={i} style={[styles.gem, { backgroundColor: card ? look.frame : 'rgba(91,103,130,0.55)' }]}><View style={styles.gemShine} /></View>
            ))}
          </View>
        )}

        {hasTitle && (
          <View style={[styles.crown, !card && styles.crownSlot]} accessible={false}><GameIcon name="crown" size={16} /></View>
        )}

        {tag === 'claim' ? (
          <Pulsing top={top} height={height} kind="bob" style={styles.claim} still={fx.reducedMotion}>
            <GameIcon name="gift" size={15} />
            <Text style={styles.claimText} maxFontSizeMultiplier={1.2}>CLAIM!</Text>
          </Pulsing>
        ) : tag === 'new' ? (
          <Pulsing top={top} height={height} kind="bob" style={styles.newTag} still={fx.reducedMotion}><GameIcon name="new" size={30} /></Pulsing>
        ) : tag === 'almost' ? (
          <View style={styles.almost}><Text style={styles.almostText} maxFontSizeMultiplier={1.2}>Almost!</Text></View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export default memo(StampTile);

/** Thin ring around the ghost art, filled to the stamp's progress (Pokemon GO medal style). */
function ProgressRing({ size, fraction, color }: { size: number; fraction: number; color: string }) {
  const stroke = 4;
  const r = size / 2 - stroke / 2 - 1;
  const { circumference, offset } = ringGeo(fraction, r);
  const c = size / 2;
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Circle cx={c} cy={c} r={r} stroke={SLOT_EDGE} strokeWidth={2} strokeDasharray="5 4" fill="none" />
      {fraction > 0 && (
        <Circle cx={c} cy={c} r={r} stroke={color} strokeWidth={stroke} fill="none" strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} rotation={-90} origin={`${c}, ${c}`} />
      )}
    </Svg>
  );
}

/** Postmark inside the art box, in a bottom corner the art leaves empty (tags own the top of the tile). */
export function postmarkCorner(free: Corner, tagged: boolean): Corner {
  void tagged;
  return free === 'tr' ? 'br' : free === 'tl' ? 'bl' : free;
}

const CORNER: Record<Corner, object> = {
  tl: { left: -12, top: 0 }, tr: { right: -12, top: 0 }, bl: { left: -12, bottom: -2 }, br: { right: -12, bottom: -2 },
};

/**
 * A tag or glow that follows the book's pulse while its tile is on screen.
 * Mounted only on tiles that need it, so ordinary tiles carry no pulse mapper.
 */
function Pulsing({ top, height, kind, style, still, children }: {
  top: SharedValue<number>; height: number; kind: 'bob' | 'glow'; style?: object; still?: boolean; children: ReactNode;
}) {
  const fx = useBookFx();
  const pulse = useTileClock(fx.pulse, top, height, 0);
  const animated = useAnimatedStyle(() => (kind === 'bob'
    ? { transform: [{ translateY: -3 * pulse.value }, { scale: 1 + 0.08 * pulse.value }] }
    : { opacity: 0.45 + 0.55 * pulse.value }));
  return <Animated.View pointerEvents="none" style={[kind === 'glow' && styles.claimGlow, style, !still && animated]}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  // Owned: a sticker card pressed onto the page.
  lip: { position: 'absolute', left: 0, right: 0, top: 6, bottom: 0, borderRadius: 18 },
  card: {
    flex: 1, marginBottom: 5, borderRadius: 18, borderWidth: 3.5, backgroundColor: '#FFFFFF',
    alignItems: 'center', paddingTop: 12, paddingHorizontal: 5, overflow: 'hidden',
  },
  cardClaim: { borderWidth: 4.5, backgroundColor: '#FFFBEA' },
  claimGlow: { position: 'absolute', left: -6, right: -6, top: -6, bottom: -2 },
  claimGlowFill: { flex: 1, borderRadius: 24, backgroundColor: 'rgba(255,194,26,0.55)' },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '40%', opacity: 0.6 },
  // Not yet: an empty slot recessed into the paper.
  slot: {
    flex: 1, marginTop: 3, marginBottom: 2, borderRadius: 18, borderWidth: 2.5, borderStyle: 'dashed', borderColor: SLOT_EDGE,
    backgroundColor: SLOT, alignItems: 'center', paddingTop: 12, paddingHorizontal: 5,
  },
  slotSecret: { borderColor: '#D9A21B' },
  artWrap: { alignItems: 'center', justifyContent: 'center' },
  ghost: { position: 'absolute', left: '9%', top: '9%', right: '9%', bottom: '9%', opacity: 0.55 },
  ghostFresh: { opacity: 0.3 },
  secret: {
    width: '78%', height: '78%', borderRadius: 999, borderWidth: 3, borderStyle: 'dashed', borderColor: '#D9A21B',
    alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,207,59,0.25)',
  },
  secretMark: { fontFamily: 'Shark', fontSize: 34, color: '#B07A00' },
  secretHint: { fontFamily: 'Knockout', fontSize: 13, color: MUTED_INK, marginTop: 2 },
  postmark: {
    position: 'absolute', width: 24, height: 24, borderRadius: 12, borderWidth: 1.5,
    borderColor: 'rgba(11,42,85,0.7)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }],
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  pmMonth: { fontFamily: 'Knockout', fontSize: 7, lineHeight: 8, color: 'rgba(11,42,85,0.9)', letterSpacing: 0.5 },
  pmDay: { fontFamily: 'Shark', fontSize: 10, lineHeight: 11, color: 'rgba(11,42,85,0.9)' },
  lock: {
    position: 'absolute', right: -2, bottom: 0, width: 24, height: 24, borderRadius: 12, backgroundColor: MUTED_INK,
    borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  name: {
    fontFamily: 'Shark', fontSize: 14, lineHeight: 16, color: INK, textAlign: 'center', marginTop: 4, textTransform: 'uppercase',
  },
  nameSlot: { color: MUTED_INK },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 3, width: '100%', paddingHorizontal: 2, marginTop: 'auto', marginBottom: 7 },
  bar: {
    flex: 1, height: 17, borderRadius: 9, backgroundColor: 'rgba(20,33,61,0.10)', overflow: 'hidden', justifyContent: 'center',
    borderWidth: 1.5, borderColor: 'rgba(20,33,61,0.25)',
  },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 8 },
  barText: { fontFamily: 'Shark', fontSize: 12, color: INK, textAlign: 'center', paddingHorizontal: 2 },
  pips: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 2 },
  pip: { height: 9, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(20,33,61,0.3)' },
  gems: { position: 'absolute', left: 9, top: 9, flexDirection: 'row', gap: 1 },
  gem: { width: 8, height: 8, borderRadius: 2, borderWidth: 1.5, borderColor: '#FFFFFF', transform: [{ rotate: '45deg' }] },
  gemShine: { position: 'absolute', left: 1, top: 1, width: 2, height: 2, borderRadius: 1, backgroundColor: 'rgba(255,255,255,0.85)' },
  crown: {
    position: 'absolute', right: -5, top: -5, width: 28, height: 28, borderRadius: 14, backgroundColor: GOLD,
    borderWidth: 2.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
    shadowColor: '#7a5200', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 0,
  },
  crownSlot: { opacity: 0.9 },
  claim: {
    position: 'absolute', top: -11, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#E3262E',
    borderRadius: 12, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 2.5, borderColor: '#FFFFFF',
  },
  claimText: { fontFamily: 'Shark', fontSize: 14, color: '#FFFFFF' },
  newTag: { position: 'absolute', top: -14, alignSelf: 'center' },
  almost: {
    position: 'absolute', top: -8, alignSelf: 'center', backgroundColor: '#FFCF3B', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 2, borderColor: INK,
  },
  almostText: { fontFamily: 'Shark', fontSize: 12, color: INK },
});
