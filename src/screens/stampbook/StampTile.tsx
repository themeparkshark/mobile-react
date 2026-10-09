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
import { almostThere, hasShine, postmark, progressLabel, rarityRank, requirement, ring as ringGeo, fillFraction, secretHint, stampState, tileLabel, type BookStamp, type Corner } from './model';

export const INK = '#14213D';
export const LIP = '#B98F45';
/** Passport paper: the page, and the darker recessed slot an unearned stamp waits in. */
export const PAPER = '#FFF6DE';
export const SLOT = '#F1E3BF';
export const SLOT_EDGE = '#C9AE78';
export const MUTED_INK = '#5B6782';
const GOLD = '#FFC21A';
/** Gift red: only a stamp with a reward waiting wears it (the CLAIM tag, the frame, the tab dot). */
const GIFT = '#E3262E';
const GIFT_LIP = '#9E1218';

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
  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const rank = rarityRank(stamp.rarity);
  const fill = state === 'progress' ? fillFraction(stamp.percent) : 0;

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
            {state === 'claim' && <View style={[styles.lip, { backgroundColor: GIFT_LIP }]} />}
            {/* Owned: stamped flat into the page in a solid rarity ring (Club Penguin's filled slot). A waiting gift stays a raised card. */}
            <View style={[state === 'claim' ? styles.card : styles.inked, state === 'claim' && { borderColor: GIFT }, state === 'claim' && styles.cardClaim]}>
              {state === 'claim' && <LinearGradient colors={['rgba(255,255,255,0.9)', 'rgba(255,255,255,0)']} style={styles.gloss} />}
              {/* Owned: printed straight onto the page, a little crooked like a real stamp, with an ink ring in its rarity colour. */}
              <View style={[styles.artWrap, { width: art, height: art }, state === 'owned' && { transform: [{ rotate: `${tiltFor(stamp.id)}deg` }] }]}>
                {state === 'owned' && (
                  <View pointerEvents="none" style={[styles.inkRing, { borderColor: look.frame, borderWidth: rank >= 4 ? 3.5 : 2.5 }]}>
                    {rank >= 4 && <View style={[styles.inkRingInner, { borderColor: look.frame }]} />}
                  </View>
                )}
                <StampArt stamp={stamp} size="thumb" placeholder={accent} priority={col < 3 ? 'high' : 'normal'} />
                {hasShine(stamp) && !fx.reducedMotion && <ShineFoil stamp={stamp} size={art} top={top} height={height} lag={col * 0.08} />}
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
                    <StampArt stamp={stamp} size="thumb" priority={col < 3 ? 'high' : 'normal'} fallbackIcon={req.icon} />
                  </View>
                  {/* In progress: the real colour fills up from the bottom with the progress (capped well short of owned). */}
                  {state === 'progress' && fill > 0 && (
                    <View style={[styles.colorFill, { height: `${Math.round(fill * 82)}%` }]} pointerEvents="none">
                      <View style={[styles.fillArt, { height: art * 0.82 }]}><StampArt stamp={stamp} size="thumb" locked={false} /></View>
                    </View>
                  )}
                  <ProgressRing size={art} fraction={stamp.percent / 100} color={accent} />
                </>
              )}
            </View>
            <Text style={[styles.name, styles.nameSlot]} numberOfLines={state === 'secret' ? 1 : 2} adjustsFontSizeToFit minimumFontScale={0.8}
              maxFontSizeMultiplier={1.3}>{state === 'secret' ? 'Secret' : stamp.shortName}</Text>
            {state !== 'secret' && (req.pips ? (
              <View style={styles.reqCol}>
                <View style={styles.reqRow}>
                  <GameIcon name={req.icon} size={15} />
                  <Text style={styles.count} maxFontSizeMultiplier={1.2}>{progressLabel(stamp)}</Text>
                </View>
                <View style={styles.pips}>
                  {Array.from({ length: stamp.target }, (_, i) => (
                    <View key={i} style={[styles.pip, { backgroundColor: i < stamp.progress ? accent : 'rgba(20,33,61,0.12)',
                      width: Math.max(4, Math.min(8, (size - 40) / stamp.target - 2)) }]} />
                  ))}
                </View>
              </View>
            ) : (
              <View style={styles.reqCol}>
                <View style={styles.reqRow}>
                  <GameIcon name={req.icon} size={15} />
                  <Text style={styles.count} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.2}>{progressLabel(stamp)}</Text>
                </View>
                <View style={styles.bar}>
                  <View style={[styles.barFill, { width: `${Math.max(stamp.percent, 0)}%`, backgroundColor: accent }]} />
                </View>
              </View>
            ))}
            {state === 'secret' && <Text style={styles.secretHint} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.2}>{secretHint(stamp)}</Text>}
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
          <View style={styles.newTag} pointerEvents="none"><GameIcon name="sparkle" size={14} /><Text style={styles.newText} maxFontSizeMultiplier={1.1}>NEW</Text></View>
        ) : tag === 'almost' ? (
          <View style={styles.almost}><Text style={styles.almostText} maxFontSizeMultiplier={1.2}>Almost!</Text></View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export default memo(StampTile);

/** A stable small tilt per stamp (-4 to 4 degrees), so the page looks hand-stamped, never random on re-render. */
export function tiltFor(id: number): number {
  return ((id * 37) % 9) - 4;
}

/** The shine sweep on a rare-or-better owned stamp. Only these tiles carry a per-frame clock (plain tiles do no scroll work). */
function ShineFoil({ stamp, size, top, height, lag }: { stamp: BookStamp; size: number; top: SharedValue<number>; height: number; lag: number }) {
  const fx = useBookFx();
  const shine = useTileClock(fx.shine, top, height, 1);
  return <Foil stamp={stamp} size={size} art="thumb" progress={shine} lag={lag} />;
}

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
  cardClaim: { borderWidth: 4.5, backgroundColor: '#FFF4F0' },
  inked: { flex: 1, marginTop: 3, marginBottom: 2, alignItems: 'center', paddingTop: 12, paddingHorizontal: 5 },
  inkRing: { position: 'absolute', left: -5, top: -5, right: -5, bottom: -5, borderRadius: 999, opacity: 0.85, alignItems: 'center', justifyContent: 'center' },
  inkRingInner: { position: 'absolute', left: 3, top: 3, right: 3, bottom: 3, borderRadius: 999, borderWidth: 1.5 },
  claimGlow: { position: 'absolute', left: -6, right: -6, top: -6, bottom: -2 },
  claimGlowFill: { flex: 1, borderRadius: 24, backgroundColor: 'rgba(255,120,90,0.5)' },
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
  colorFill: { position: 'absolute', left: '9%', right: '9%', bottom: '9%', overflow: 'hidden' },
  fillArt: { position: 'absolute', left: 0, right: 0, bottom: 0 },
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
  reqCol: { width: '100%', paddingHorizontal: 4, marginTop: 'auto', marginBottom: 8, gap: 3 },
  reqRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  count: { flexShrink: 1, fontFamily: 'Shark', fontSize: 15, color: INK },
  bar: { height: 8, borderRadius: 4, backgroundColor: 'rgba(20,33,61,0.13)', overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 4 },
  pips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 2 },
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
  // NEW is a round blue seal (CLAIM is a square red gift tag): different shape, not just colour.
  newTag: {
    position: 'absolute', top: -14, alignSelf: 'center', width: 40, height: 40, borderRadius: 20, backgroundColor: '#1E88E5',
    borderWidth: 2.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  newText: { fontFamily: 'Shark', fontSize: 11, lineHeight: 12, color: '#FFFFFF', marginTop: -1 },
  almost: {
    position: 'absolute', top: -8, alignSelf: 'center', backgroundColor: '#FFCF3B', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2,
    borderWidth: 2, borderColor: INK,
  },
  almostText: { fontFamily: 'Shark', fontSize: 12, color: INK },
});
