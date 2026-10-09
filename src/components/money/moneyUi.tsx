/**
 * The money kit: Alex's shop card language (shop/Shop_ref.png) for real-money
 * packs, used by Supplies and by every top-up offer in the game.
 *
 * - ShopCard: Alex's blue card, thick white rim, a navy lip, a colored name
 *   band and a navy price bar. The whole card is the button.
 * - PriceBar: Apple's localized price, always beside the green "$" (the one
 *   picture for real money), so a price never reads as Shark Coins.
 * - Sticker: Alex's tilted red NEW! sticker shape, for honest value notes.
 * - GotIt: the purchase payoff (rays, the pack art popping, confetti, the
 *   contents counting in, a coin cue and a success buzz). UI-thread only,
 *   capped pieces, still under Reduce Motion.
 */
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing, FadeIn, FadeInDown, ZoomIn, cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSpring, withTiming,
} from 'react-native-reanimated';
import type { ShopGrants, ShopProduct } from '../../api/endpoints/me/shop';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { haptic } from '../../gamekit/Haptics';
import { BRAND, FONT, GameButton, GameIcon, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import RealMoneyMark from '../RealMoneyMark';
import RewardBurst from '../RewardBurst';
import { unitWord } from '../../services/money/copy';

export { unitWord };

export const MAX_FONT = 1.25;

/** Alex's shop card blues (shop/slice17-20), the band colors and the lip. */
export const CARD = {
  top: '#3cc0ff',
  bottom: '#0a8fe8',
  rim: '#ffffff',
  lip: '#05346e',
  bar: '#0d3f7d',
  barDeep: '#082d5c',
  band: { gold: '#f5a623', green: '#2fb44a', blue: '#0b62b8', navy: '#123f80' },
} as const;
export type BandColor = keyof typeof CARD.band;

const ART = {
  'coins-1': require('../../../assets/images/supplies/coins-1.webp'),
  'coins-2': require('../../../assets/images/supplies/coins-2.webp'),
  'coins-3': require('../../../assets/images/supplies/coins-3.webp'),
  'coins-4': require('../../../assets/images/supplies/coins-4.webp'),
  'tickets-1': require('../../../assets/images/supplies/ticket-1.webp'),
  'tickets-2': require('../../../assets/images/supplies/ticket-3.webp'),
  'tickets-3': require('../../../assets/images/supplies/ticket-bundle.webp'),
  rescue: require('../../../assets/images/supplies/rescue-pass.webp'),
  gift: require('../../../assets/images/supplies/gift.webp'),
  chest: require('../../../assets/images/supplies/chest.webp'),
  bag: require('../../../assets/images/supplies/park-bag.webp'),
  sticker: require('../../../assets/images/supplies/sticker-new.webp'),
} as const;
export type PackArtKey = keyof typeof ART;

export function artSource(key: PackArtKey): number {
  return ART[key];
}

/** Which of Alex's pictures a pack shows: bigger packs get a bigger pile. */
export function packArtKey(product: Pick<ShopProduct, 'product_id' | 'grants' | 'section'>, tier = 0): PackArtKey {
  const id = product.product_id;
  if (id.endsWith('.pack.starter')) return 'chest';
  if (id.endsWith('.deal.daily')) return 'gift';
  if (id.endsWith('.pack.parkday')) return 'bag';
  const g = product.grants;
  const only = (Object.keys(g) as (keyof ShopGrants)[]).filter(k => (g[k] ?? 0) > 0);
  if (only.length === 1 && only[0] === 'rescue_passes') return 'rescue';
  if (only.length === 1 && only[0] === 'tickets') return (['tickets-1', 'tickets-2', 'tickets-3'] as const)[Math.min(2, tier)];
  if (only.length === 1 && only[0] === 'coins') return (['coins-1', 'coins-2', 'coins-3', 'coins-4'] as const)[Math.min(3, tier)];
  return 'gift';
}

const CURRENCY_ICON: Record<keyof ShopGrants, GameIconName> = { tickets: 'ticket', coins: 'coins', energy: 'energy', rescue_passes: 'retry' };
const ORDER: (keyof ShopGrants)[] = ['tickets', 'coins', 'energy', 'rescue_passes'];

export function currencyIcon(kind: keyof ShopGrants): GameIconName {
  return CURRENCY_ICON[kind];
}

/** Alex's card: blue gradient, white rim, navy lip; press sinks into the lip. */
export function ShopCard({ children, onPress, disabled, style, accessibilityLabel, glow, fill }: {
  children: ReactNode; onPress?: () => void; disabled?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
  /** Stretch to the parent's height (cards side by side line up). */
  fill?: boolean;
  /** A gold rim for the one card a section recommends ("Best value"). */
  glow?: boolean;
}) {
  return (
    <Pressable onPress={onPress} disabled={disabled || !onPress} accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel} accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.lip, style, pressed && !disabled && s.lipPressed]}>
      {({ pressed }) => (
        <View style={[s.card, fill && { flex: 1 }, glow && s.cardGlow, pressed && !disabled && s.cardPressed]}>
          <LinearGradient pointerEvents="none" colors={[CARD.top, CARD.bottom]} style={StyleSheet.absoluteFill} />
          <View pointerEvents="none" style={s.gloss} />
          {children}
        </View>
      )}
    </Pressable>
  );
}

/** The colored name band across the card (Alex's SEASONAL / COMMON / RARE band). */
export function Band({ text, color = 'navy', size = 17 }: { text: string; color?: BandColor; size?: number }) {
  return (
    <View style={[s.band, { backgroundColor: CARD.band[color] }]}>
      <Text maxFontSizeMultiplier={MAX_FONT} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
        style={[s.bandText, { fontSize: size }]}>{text}</Text>
    </View>
  );
}

/** Apple's price on the navy bar, with the green "$". `note` replaces the price when the pack can't be bought now. */
export function PriceBar({ price, busy, note, big }: { price?: string | null; busy?: boolean; note?: string | null; big?: boolean }) {
  return (
    <View style={[s.bar, big && s.barBig]}>
      {note ? (
        <Text maxFontSizeMultiplier={MAX_FONT} style={s.barNote} numberOfLines={2}>{note}</Text>
      ) : (
        <>
          {!!price && !busy && <RealMoneyMark size={big ? 26 : 20} />}
          <Text maxFontSizeMultiplier={MAX_FONT} style={[s.barPrice, big && s.barPriceBig]} numberOfLines={1}>
            {busy ? 'ONE MOMENT' : price ?? 'LOADING'}
          </Text>
        </>
      )}
    </View>
  );
}

/** Alex's tilted red sticker (NEW!) carrying an honest note: "+21% MORE", "3X VALUE". */
export function Sticker({ text, style, tone = 'red' }: { text: string; style?: StyleProp<ViewStyle>; tone?: 'red' | 'gold' }) {
  return (
    <View style={[s.sticker, tone === 'gold' && s.stickerGold, style]} pointerEvents="none">
      <Text maxFontSizeMultiplier={1.1} style={[s.stickerText, tone === 'gold' && s.stickerTextGold]} numberOfLines={1}>{text}</Text>
    </View>
  );
}

/** What's inside, as picture + count chips. */
export function Contents({ grants, size = 'big', tone = 'onBlue' }: { grants: ShopGrants; size?: 'big' | 'small'; tone?: 'onBlue' | 'onLight' }) {
  return (
    <View style={s.contents}>
      {ORDER.filter(k => (grants[k] ?? 0) > 0).map(k => (
        <View key={k} style={[s.chip, tone === 'onLight' && s.chipLight]}>
          <GameIcon name={CURRENCY_ICON[k]} size={size === 'big' ? 22 : 18} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={[s.chipText, size === 'small' && s.chipTextSmall, tone === 'onLight' && s.chipTextLight]}>
            {(grants[k] ?? 0).toLocaleString('en-US')} {k === 'rescue_passes' ? unitWord(k, grants[k] ?? 0) : unitWord(k, grants[k] ?? 0)}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** The art with a soft bob (UI thread; still under Reduce Motion). */
export function PackArt({ art, size, bob = true }: { art: PackArtKey; size: number; bob?: boolean }) {
  const still = useUiReducedMotion();
  const t = useSharedValue(0);
  useEffect(() => {
    if (still || !bob) return undefined;
    t.value = withRepeat(withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(t);
  }, [still, bob, t]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -t.value * 4 }, { rotate: `${(t.value - 0.5) * 3}deg` }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, style]}>
      <Image source={ART[art]} style={{ width: size, height: size }} contentFit="contain" />
    </Animated.View>
  );
}

const RAYS = require('../../../assets/images/reveal/rays.webp');

/**
 * The payoff after a purchase lands: rays turn behind the pack art, the art
 * pops, confetti bursts, the contents slide in, one cue and one buzz.
 */
export function GotIt({ grants, art, title = 'You got it!', onDone, picture, caption }: {
  grants: ShopGrants | null; art: PackArtKey; title?: string; onDone: () => void;
  /** A custom picture instead of the pack art (a season item), and one line under the title. */
  picture?: ReactNode; caption?: string;
}) {
  const still = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  const burst = useSharedValue(0);
  const spin = useSharedValue(0);
  const visible = !!grants;
  useEffect(() => {
    if (!visible) return undefined;
    haptic('success');
    playSound?.(require('../../../assets/sounds/purchase_item_success.mp3'));
    const coin = setTimeout(() => playSound?.(require('../../../assets/sounds/coin.mp3'), { volume: 0.8 }), 380);
    if (!still) {
      burst.value = 0;
      burst.value = withDelay(180, withTiming(1, { duration: 900, easing: Easing.out(Easing.cubic) }));
      spin.value = withRepeat(withTiming(1, { duration: 14000, easing: Easing.linear }), -1, false);
    }
    return () => { clearTimeout(coin); cancelAnimation(spin); };
  }, [visible, still, burst, spin, playSound]);
  const rays = useAnimatedStyle(() => ({ transform: [{ rotate: `${spin.value * 360}deg` }] }));
  if (!grants) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone} statusBarTranslucent>
      <Pressable style={s.gotScrim} onPress={onDone} accessibilityRole="button" accessibilityLabel={`${title} Tap to continue.`}>
        <View style={s.gotStage}>
          {!still && <Animated.Image source={RAYS} style={[s.gotRays, rays]} resizeMode="contain" />}
          <Animated.View entering={still ? undefined : ZoomIn.springify().damping(9).stiffness(160)}>
            {picture ?? <Image source={ART[art]} style={s.gotArt} contentFit="contain" />}
          </Animated.View>
          {!still && <RewardBurst progress={burst} x={140} y={110} />}
        </View>
        <Animated.Text entering={still ? undefined : FadeInDown.delay(250).springify().damping(14)} maxFontSizeMultiplier={MAX_FONT} style={s.gotTitle}>{title}</Animated.Text>
        <Animated.View entering={still ? undefined : FadeInDown.delay(420).springify().damping(14)}>
          {caption ? <Text maxFontSizeMultiplier={MAX_FONT} style={s.gotCaption}>{caption}</Text> : <Contents grants={grants} />}
        </Animated.View>
        <Animated.View entering={still ? undefined : FadeIn.delay(700)} style={{ marginTop: 18, width: 240 }}>
          <GameButton label="Awesome" onPress={onDone} />
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  lip: { borderRadius: 20, backgroundColor: CARD.lip, paddingBottom: 6 },
  lipPressed: { paddingBottom: 2, marginTop: 4 },
  card: { borderRadius: 20, borderWidth: 4, borderColor: CARD.rim, overflow: 'hidden', alignItems: 'center' },
  cardGlow: { borderColor: '#ffd84a' },
  cardPressed: { opacity: 0.96 },
  gloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '38%', backgroundColor: 'rgba(255,255,255,0.12)' },
  band: { alignSelf: 'stretch', paddingVertical: 4, paddingHorizontal: 8, alignItems: 'center' },
  bandText: { fontFamily: FONT.display, color: '#ffffff', textShadowColor: 'rgba(5,52,110,0.65)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  bar: { alignSelf: 'stretch', minHeight: 44, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center',
    backgroundColor: CARD.bar, borderTopWidth: 3, borderTopColor: CARD.barDeep, paddingHorizontal: 8, paddingVertical: 6 },
  barBig: { minHeight: 54 },
  barPrice: { fontFamily: FONT.display, fontSize: 21, color: '#ffffff', textShadowColor: CARD.barDeep, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  barPriceBig: { fontSize: 27 },
  barNote: { fontFamily: FONT.body, fontSize: 14, color: '#d5ecff', textAlign: 'center', lineHeight: 17 },
  sticker: { position: 'absolute', backgroundColor: '#e8322a', borderWidth: 3, borderColor: '#ffffff', borderRadius: 10,
    paddingHorizontal: 7, paddingVertical: 1, transform: [{ rotate: '-8deg' }], shadowColor: BRAND.navy, shadowOpacity: 0.3, shadowRadius: 0, shadowOffset: { width: 0, height: 2 } },
  stickerGold: { backgroundColor: '#ffcf3b' },
  stickerText: { fontFamily: FONT.display, fontSize: 14, color: '#ffffff' },
  stickerTextGold: { color: '#6a3b00' },
  contents: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(5,52,110,0.55)', borderRadius: 12,
    paddingHorizontal: 8, paddingVertical: 4, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  chipLight: { backgroundColor: '#eef6ff', borderColor: '#cfe4fb' },
  chipText: { fontFamily: FONT.display, fontSize: 15, color: '#ffffff' },
  chipTextSmall: { fontSize: 13 },
  chipTextLight: { color: BRAND.navy },
  gotScrim: { flex: 1, backgroundColor: 'rgba(5,40,96,0.86)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  gotStage: { width: 280, height: 240, alignItems: 'center', justifyContent: 'center' },
  gotRays: { position: 'absolute', width: 420, height: 420, opacity: 0.55 },
  gotArt: { width: 190, height: 190 },
  gotCaption: { fontFamily: FONT.display, fontSize: 22, color: '#ffffff', textAlign: 'center' },
  gotTitle: { fontFamily: FONT.display, fontSize: 40, color: BRAND.gold, marginTop: 4, marginBottom: 10,
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
});
