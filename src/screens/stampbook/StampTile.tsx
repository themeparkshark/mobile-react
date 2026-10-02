/**
 * One stamp in the book, in Alex's chunky card language: navy outline, white
 * stroke, darker bottom lip, gloss band, parchment page. Every tile in a row is
 * the same height.
 *
 * Earned: full-colour sticker, a passport postmark with the date, alpha-shaped
 * foil by rarity, a rarity gem. Claimable: a bobbing red CLAIM tag. Unseen: a
 * NEW tag. Locked: the navy ghost of the real art inside a dashed "stamp here"
 * ring, a pictogram of what to do and a chunky progress bar (pips for streaks).
 *
 * Tiles never re-render when the card opens or the page scrolls: all motion
 * reads shared values from BookFx on the UI thread.
 */
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import { rarityToneByName } from '../../constants/coinTiers';
import GameIcon from '../../ui/GameIcon';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import { onScreen, useBookFx } from './BookFx';
import Foil from './Foil';
import StampArt from './StampArt';
import { almostThere, hasShine, postmark, progressLabel, requirement, tileLabel, type BookStamp } from './model';

export const INK = '#14213D';
export const LIP = '#B98F45';

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
  const tone = rarityToneByName(stamp.rarity);
  const legendary = stamp.earned && stamp.rarity === 'legendary';
  const art = Math.round(size * 0.78);
  const req = requirement(stamp);
  const almost = almostThere(stamp);
  const mark = stamp.earned ? postmark(stamp.earnedAt) : null;

  const visible = useDerivedValue(() =>
    !fx.paused.value && onScreen(gridTop.value + localY.value, height, fx.scrollY.value, fx.viewportH.value));

  const pressStyle = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const bob = useAnimatedStyle(() => ({
    transform: [{ translateY: visible.value ? -3 * fx.pulse.value : 0 }, { scale: visible.value ? 1 + 0.08 * fx.pulse.value : 1 }],
  }));
  const glow = useAnimatedStyle(() => ({ opacity: visible.value ? 0.35 + 0.45 * fx.pulse.value : 0.35 }));

  const onLayout = (e: LayoutChangeEvent) => { localY.value = e.nativeEvent.layout.y; };

  return (
    <Animated.View style={[{ width: size, height }, pressStyle]} onLayout={onLayout}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={tileLabel(stamp)}
        onPressIn={() => { press.value = withSpring(0.93, { damping: 14, stiffness: 420 }); }}
        onPressOut={() => { press.value = withSpring(1, { damping: 9, stiffness: 320 }); }}
        onPress={() => { playSfx('ui.tap'); haptic('tapLight'); onPress(stamp); }}
        style={styles.fill}
      >
        {/* Alex card: lip, navy outline, white stroke, page, gloss */}
        <View style={[styles.lip, { backgroundColor: stamp.earned ? (legendary ? '#B8860B' : LIP) : 'rgba(5,30,70,0.55)' }]} />
        <View style={[styles.outline, legendary && styles.outlineGold]}>
          <View style={[styles.page, stamp.earned ? styles.pageEarned : styles.pageLocked]}>
            {stamp.earned && <LinearGradient colors={['rgba(255,255,255,0.75)', 'rgba(255,255,255,0)']} style={styles.gloss} />}
            {almost && <Animated.View pointerEvents="none" style={[styles.almostGlow, glow]} />}

            <View style={[styles.artWrap, { width: art, height: art }]}>
              {!stamp.earned && !stamp.secret && <View style={[styles.stampHere, { borderColor: `${accent}AA` }]} />}
              {stamp.secret ? (
                <View style={[styles.secret, { borderColor: accent }]}><GameIcon name="info" size={art * 0.42} /></View>
              ) : (
                <StampArt stamp={stamp} size="thumb" placeholder={accent} priority={col < 3 ? 'high' : 'normal'} />
              )}
              {hasShine(stamp) && !fx.reducedMotion && (
                <Foil stamp={stamp} size={art} art="thumb" progress={fx.shine} visible={visible} lag={col * 0.08} />
              )}
              {!!mark && (
                <View style={styles.postmark} accessible={false}>
                  <Text style={styles.pmMonth} maxFontSizeMultiplier={1}>{mark.month}</Text>
                  <Text style={styles.pmDay} maxFontSizeMultiplier={1}>{mark.day}</Text>
                  <Text style={styles.pmYear} maxFontSizeMultiplier={1}>{mark.year}</Text>
                </View>
              )}
              {!stamp.earned && !stamp.secret && (
                <View style={styles.lock}><GameIcon name="lock" size={14} /></View>
              )}
            </View>

            <Text style={[styles.name, !stamp.earned && styles.nameLocked]} numberOfLines={2}
              adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={1.3}>{stamp.shortName}</Text>

            {!stamp.earned && !stamp.secret && (
              <View style={styles.req}>
                <View style={styles.reqRow}>
                  <GameIcon name={req.icon} size={16} />
                  {req.count !== null && <Text style={styles.reqCount} maxFontSizeMultiplier={1.3}>x{req.count.toLocaleString('en-US')}</Text>}
                </View>
                {req.pips ? (
                  <View style={styles.pips}>
                    {Array.from({ length: stamp.target }, (_, i) => (
                      <View key={i} style={[styles.pip, { backgroundColor: i < stamp.progress ? accent : 'rgba(255,255,255,0.22)',
                        width: Math.max(4, Math.min(9, (size - 24) / stamp.target - 2)) }]} />
                    ))}
                  </View>
                ) : (
                  <View style={styles.bar}>
                    <View style={[styles.barFill, { width: `${Math.max(stamp.percent, 4)}%`, backgroundColor: accent }]} />
                    <Text style={styles.barText} maxFontSizeMultiplier={1.2}>{progressLabel(stamp)}</Text>
                  </View>
                )}
              </View>
            )}
          </View>
        </View>

        {/* rarity gem, earned or locked */}
        <View style={[styles.gem, { backgroundColor: tone.color }]} accessible={false}>
          <View style={styles.gemShine} />
        </View>

        {stamp.claimable ? (
          <Animated.View style={[styles.claim, !fx.reducedMotion && bob]}>
            <GameIcon name="gift" size={14} />
            <Text style={styles.claimText} maxFontSizeMultiplier={1.2}>CLAIM!</Text>
          </Animated.View>
        ) : isNew && stamp.earned ? (
          <Animated.View style={[styles.newTag, !fx.reducedMotion && bob]}><GameIcon name="new" size={30} /></Animated.View>
        ) : almost ? (
          <View style={styles.almost}><Text style={styles.almostText} maxFontSizeMultiplier={1.2}>Almost!</Text></View>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export default memo(StampTile);

const styles = StyleSheet.create({
  fill: { flex: 1 },
  lip: { position: 'absolute', left: 0, right: 0, top: 6, bottom: 0, borderRadius: 18 },
  outline: { flex: 1, marginBottom: 5, borderRadius: 18, borderWidth: 2, borderColor: '#0B2A55', overflow: 'hidden' },
  outlineGold: { borderColor: '#8A5A00', borderWidth: 3 },
  page: { flex: 1, borderRadius: 16, borderWidth: 3, alignItems: 'center', paddingTop: 7, paddingHorizontal: 5 },
  pageEarned: { backgroundColor: '#FFF8E4', borderColor: '#FFFFFF' },
  pageLocked: { backgroundColor: 'rgba(8,52,120,0.55)', borderColor: 'rgba(255,255,255,0.35)' },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '45%', opacity: 0.55 },
  almostGlow: { ...StyleSheet.absoluteFillObject, borderRadius: 14, borderWidth: 3, borderColor: '#FFCF3B' },
  artWrap: { alignItems: 'center', justifyContent: 'center' },
  stampHere: { position: 'absolute', left: '4%', top: '4%', right: '4%', bottom: '4%', borderRadius: 999, borderWidth: 2.5, borderStyle: 'dashed' },
  secret: { width: '80%', height: '80%', borderRadius: 999, borderWidth: 3, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,207,59,0.12)' },
  postmark: {
    position: 'absolute', right: -12, bottom: -10, width: 36, height: 36, borderRadius: 18, borderWidth: 2,
    borderColor: 'rgba(11,42,85,0.72)', alignItems: 'center', justifyContent: 'center', transform: [{ rotate: '-8deg' }],
    backgroundColor: 'rgba(255,248,228,0.6)',
  },
  pmMonth: { fontFamily: 'Knockout', fontSize: 8, lineHeight: 9, color: 'rgba(11,42,85,0.85)', letterSpacing: 0.5 },
  pmDay: { fontFamily: 'Shark', fontSize: 12, lineHeight: 13, color: 'rgba(11,42,85,0.85)' },
  pmYear: { fontFamily: 'Knockout', fontSize: 7, lineHeight: 8, color: 'rgba(11,42,85,0.85)' },
  lock: {
    position: 'absolute', right: 0, bottom: 2, width: 26, height: 26, borderRadius: 13, backgroundColor: '#0B2A55',
    borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  name: {
    fontFamily: 'Shark', fontSize: 15, lineHeight: 17, color: INK, textAlign: 'center', marginTop: 3, textTransform: 'uppercase',
  },
  nameLocked: { color: '#FFFFFF', textShadowColor: '#05346e', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 },
  req: { width: '100%', alignItems: 'center', marginTop: 3 },
  reqRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  reqCount: { fontFamily: 'Shark', fontSize: 13, color: '#FFFFFF' },
  bar: { width: '94%', height: 15, borderRadius: 8, backgroundColor: 'rgba(0,20,60,0.55)', marginTop: 3, overflow: 'hidden', justifyContent: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 7 },
  barText: { fontFamily: 'Shark', fontSize: 12, color: '#FFFFFF', textAlign: 'center', textShadowColor: '#05346e', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 },
  pips: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 2, marginTop: 4, width: '94%' },
  pip: { height: 9, borderRadius: 5, borderWidth: 1, borderColor: 'rgba(255,255,255,0.5)' },
  gem: {
    position: 'absolute', left: 9, top: 9, width: 14, height: 14, borderRadius: 3, borderWidth: 2, borderColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
  },
  gemShine: { position: 'absolute', left: 1, top: 1, width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.85)' },
  claim: {
    position: 'absolute', top: -9, right: -6, flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: '#E3262E',
    borderRadius: 11, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 2.5, borderColor: '#FFFFFF',
  },
  claimText: { fontFamily: 'Shark', fontSize: 13, color: '#FFFFFF' },
  newTag: { position: 'absolute', top: -12, right: -8 },
  almost: { position: 'absolute', top: -8, right: -4, backgroundColor: '#FFCF3B', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, borderWidth: 2, borderColor: INK },
  almostText: { fontFamily: 'Shark', fontSize: 12, color: INK },
});
