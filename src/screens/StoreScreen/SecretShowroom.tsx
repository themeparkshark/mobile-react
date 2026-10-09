/**
 * The Secret Shop as one showroom (Dustin, Oct 8: "very ugly and hard to navigate. Simplify and
 * make it more amazing animation-wise").
 *
 * Was: four stacked gold panels with ribbon banners (The Vault, the season drop, More in the
 * Vault, Tonight's Pick) holding about five pieces across three screens.
 * Now, one screen:
 * 1. A slim top row: who you are here (VIP, or a guest in the members' room), Favorites, coins.
 * 2. The stage: YOUR shark wearing the picked piece, live, on the vault plinth under gold rays and
 *    twinkling stars. Picking a piece puts it on with its own moment and sound; a tap on the shark
 *    plays it again. One small chip says which shelf it is from and when that shelf changes.
 * 3. The plate: name, what it does in one line, the price and one button (Get it, Wear it, or for
 *    a guest "See VIP", the VIP pitch; the grown-up gate sits on its purchase tap).
 * 4. The picker: every piece in the room in one row of animated tiles. Tap one to put it on.
 *
 * Buying, wearing and the member rules stay in the try-on sheet (MEMBER_WEAR_LOCK, the
 * members_only refusal, the grown-up gate): "Get it" and "Wear it" open it on that piece.
 *
 * Performance: one Playercard on the stage; tiles run their rig at tile size; everything rests
 * under the try-on (FxPauseContext from the shelves) and under Reduce Motion.
 */
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Dimensions, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, {
  FadeIn, FadeInDown, FadeInUp, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useIsFocused } from '@react-navigation/native';
import { useAnyModalLayer } from '../../ui/modalLayers';
import { openMembership } from '../../components/GrownUpGate';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { FxSceneBackdrop } from '../../fx/FxSolo';
import { FxPauseContext } from '../../fx/FxStage';
import { FX_BLURB, fxKeyOf } from '../../fx/registry';
import { SECRET_THEME as V } from '../../fx/secretTheme';
import { formatCoins, shortDate, stageCard } from '../../helpers/shopShelves';
import { showroomEntries, showroomStageH, shelfWhen, type ShowroomEntry, type ShowroomKind } from '../../helpers/shopShowroom';
import { leavingIcon, leavingSay, visibleLeaving } from '../../helpers/shopLifecycle';
import { isItemWorn, itemDisplayName } from '../../helpers/wardrobe';
import type { ShopItem, ShopSection } from '../../models/shop-today';
import { FONT, GameIcon, type GameIconName } from '../../ui';
import { SECRET_PREVIEW_COPY, StarMotes } from './SecretShopUi';
import { VaultPanel, VaultSecondaryButton } from './SecretVault';
import { TileArt } from './ShopTile';
import { previewLook } from './TryOnSheet';
import { MAX_FONT, Sheen, ShopCta, ShopStage, useShopNow, WishHeart } from './shopUi';
import { useWishCount, useWished } from './wishStore';

const SCREEN_W = Dimensions.get('window').width;
const PANEL_W = SCREEN_W - 20;
const INNER_W = PANEL_W - 6;
const TILE = 108;
const RAIL_PAD = 18;
const KIND: Record<ShowroomKind, { icon: GameIconName; name: (s: ShopSection) => string }> = {
  vault: { icon: 'crown', name: () => 'The Vault' },
  season: { icon: 'sparkle', name: s => s.title || 'Season drop' },
  tonight: { icon: 'star', name: () => "Tonight's Pick" },
};

/** A season drop's drawn art (Alex-style pipeline art, wave 2), shown in its shelf chip and tile badge. */
const SEASON_ART: Record<string, number> = {
  halloween: require('../../../assets/fx/moonbats.webp'),
  holiday: require('../../../assets/fx/gift-mini.webp'),
  winter: require('../../../assets/fx/snowflake.webp'),
  valentines: require('../../../assets/fx/heart-red.webp'),
  new_year: require('../../../assets/fx/fw-crown.webp'),
  park_birthday: require('../../../assets/fx/party-hat.webp'),
  spring: require('../../../assets/fx/blossom-crown.webp'),
  summer: require('../../../assets/fx/snorkel-mask.webp'),
};

/** The shelf mark: drawn season art when there is some, else the shelf's UI kit icon. */
function ShelfMark({ entry, size }: { entry: ShowroomEntry; size: number }) {
  const art = entry.kind === 'season' && entry.section.event_key ? SEASON_ART[entry.section.event_key] : undefined;
  if (art != null) return <Image source={art} style={{ width: size + 4, height: size + 4 }} contentFit="contain" />;
  return <GameIcon name={iconFor(entry)} size={size} />;
}

function seasonIcon(key: string | null | undefined): GameIconName {
  if (key === 'halloween') return 'pumpkin';
  if (key === 'valentines') return 'heart';
  if (key === 'holiday') return 'gift';
  return 'sparkle';
}

function iconFor(entry: ShowroomEntry): GameIconName {
  return entry.kind === 'season' ? seasonIcon(entry.section.event_key) : KIND[entry.kind].icon;
}

/** Which shelf the picked piece is from, and when that shelf changes. One chip, no countdown. */
function ShelfChip({ entry, offset }: { entry: ShowroomEntry; offset: number }) {
  const now = useShopNow(offset);
  const name = KIND[entry.kind].name(entry.section);
  const when = shelfWhen(entry, now);
  return (
    <Animated.View key={`${entry.kind}:${entry.section.key}`} entering={FadeIn.duration(180)} style={styles.shelfChip}
      accessible accessibilityLabel={`${name}. ${when}.`}>
      <ShelfMark entry={entry} size={16} />
      <Text maxFontSizeMultiplier={MAX_FONT} numberOfLines={1} style={styles.shelfName}>{name.toUpperCase()}</Text>
      <View style={styles.shelfDot} />
      <Text maxFontSizeMultiplier={MAX_FONT} numberOfLines={1} style={styles.shelfWhen}>{when}</Text>
    </Animated.View>
  );
}

function StageHeart({ item, onWish }: { item: ShopItem; onWish: (item: ShopItem) => void }) {
  const wished = useWished(item.id);
  const pop = useSharedValue(1);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    pop.value = withSequence(withTiming(1.4, { duration: 110 }), withSpring(1, { damping: 6, stiffness: 260 }));
  }, [wished]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }] }));
  return (
    <Pressable onPress={() => onWish(item)} hitSlop={10} accessibilityRole="button" accessibilityState={{ selected: wished }}
      accessibilityLabel={wished ? `Remove ${itemDisplayName(item)} from Favorites` : `Save ${itemDisplayName(item)} to Favorites`}
      style={[styles.heart, wished && styles.heartOn]}>
      <Animated.View style={style}><WishHeart on={wished} size={24} /></Animated.View>
    </Pressable>
  );
}

const RailTile = memo(function RailTile({ entry, selected, owned, member, still, onPick }: {
  entry: ShowroomEntry; selected: boolean; owned: boolean; member: boolean; still: boolean; onPick: (id: number) => void;
}) {
  const lift = useSharedValue(selected ? 1 : 0);
  useEffect(() => { lift.value = still ? (selected ? 1 : 0) : withSpring(selected ? 1 : 0, { damping: 12, stiffness: 220 }); }, [selected, still]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * lift.value }, { scale: 1 + 0.06 * lift.value }] }));
  const { item } = entry;
  const name = itemDisplayName(item);
  return (
    <Pressable onPress={() => onPick(item.id)} hitSlop={4} accessibilityRole="button" accessibilityState={{ selected }}
      accessibilityLabel={`${name}, ${KIND[entry.kind].name(entry.section)}, ${owned ? 'yours' : `${formatCoins(item.cost)} coins${member ? '' : ', VIP members can buy'}`}. Tap to put it on your shark.`}>
      <Animated.View style={[styles.tile, selected && styles.tileOn, style]}>
        <View style={styles.tileClip} pointerEvents="none">
          <LinearGradient colors={[...V.tilePlate]} style={StyleSheet.absoluteFill} />
          <LinearGradient colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0)']} style={styles.tileGloss} />
          <View style={styles.tileArt}><TileArt item={item} size={TILE - 22} still={still} /></View>
        </View>
        <Text maxFontSizeMultiplier={1.1} numberOfLines={1} style={styles.tileName}>{name}</Text>
        <View style={[styles.tilePrice, owned && styles.tileOwned]} pointerEvents="none">
          {owned ? <GameIcon name="check" size={13} /> : <GameIcon name="coins" size={13} />}
          <Text maxFontSizeMultiplier={1.15} style={styles.tilePriceText}>{owned ? 'Yours' : formatCoins(item.cost)}</Text>
        </View>
      </Animated.View>
    </Pressable>
  );
});

export default function SecretShowroom({ sections, heroId, offset, still, bought, onOpen, onWish, onFavorites }: {
  readonly sections: readonly ShopSection[];
  readonly heroId: number | null | undefined;
  readonly offset: number;
  readonly still: boolean;
  /** Bought this visit (the server's owned flag can lag the refresh). */
  readonly bought: readonly number[];
  readonly onOpen: (item: ShopItem, opts?: { bought?: boolean; confirm?: boolean }) => void;
  readonly onWish: (item: ShopItem) => void;
  readonly onFavorites: () => void;
}) {
  const { player } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const paused = useContext(FxPauseContext);
  const covered = useAnyModalLayer();
  const focused = useIsFocused();
  const insets = useSafeAreaInsets();
  const member = !!player?.is_subscribed;
  const { height: winH } = useWindowDimensions();
  const stageH = showroomStageH(SCREEN_W, winH, insets.top, insets.bottom, !member);
  // Room above the shark for the jetpack's lift (up to 0.135 of the card), as on the old Vault stage.
  const card = useMemo(() => stageCard(INNER_W, stageH, 0.16 * stageH), [stageH]);
  const cardStyle = useMemo(() => ({ position: 'absolute' as const, ...card.box }), [card]);
  const balance = Number(player?.coins ?? 0);
  const wishes = useWishCount();
  const entries = useMemo(() => showroomEntries(sections, heroId), [sections, heroId]);
  const [pickedId, setPickedId] = useState<number | null>(null);
  const entry = entries.find(e => e.item.id === pickedId) ?? entries[0] ?? null;
  const item = entry?.item ?? null;
  const stage = useMemo(() => (item ? previewLook(player?.inventory, [{ id: item.id, name: item.name, icon_url: item.icon_url,
    paper_url: item.paper_url, no_eye_url: item.no_eye_url, item_type: item.item_type, fx_key: item.fx_key ?? null }], 'base') : null),
  [player?.inventory, item?.id]);
  const rail = useRef<ScrollView>(null);

  // The stage answers each pick: a quick squash-and-settle, a gold flare on the rim.
  const bump = useSharedValue(0);
  const stageStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.035 * Math.sin(Math.PI * bump.value) }] }));
  const flare = useSharedValue(0);
  const flareStyle = useAnimatedStyle(() => ({ opacity: flare.value }));
  // Stable across picks (refs), so the memoized rail tiles never re-render for nothing.
  const pickedRef = useRef(pickedId);
  pickedRef.current = pickedId;
  const entriesRef = useRef(entries);
  entriesRef.current = entries;
  const stillRef = useRef(still);
  stillRef.current = still;
  const soundRef = useRef(playSound);
  soundRef.current = playSound;
  const pick = useCallback((id: number) => {
    const entries = entriesRef.current;
    const still = stillRef.current;
    const playSound = soundRef.current;
    if (id === (pickedRef.current ?? entries[0]?.item.id)) return;
    void Haptics.selectionAsync().catch(() => undefined);
    playSound(require('../../../assets/sounds/inventory_item_tap.mp3'), { volume: 0.7 });
    setPickedId(id);
    if (!still) {
      bump.value = 0; bump.value = withTiming(1, { duration: 320 });
      flare.value = withSequence(withTiming(0.9, { duration: 90 }), withTiming(0, { duration: 420 }));
    }
    const index = entries.findIndex(e => e.item.id === id);
    if (index >= 0) rail.current?.scrollTo({ x: Math.max(0, index * (TILE + 12) + RAIL_PAD - (SCREEN_W - TILE) / 2), animated: !still });
  }, []);

  // The room's "you're in" moment: a soft cue and one tap of haptics with the gold light sweep.
  useEffect(() => {
    if (still) return;
    const t = setTimeout(() => {
      soundRef.current(require('../../../assets/sounds/reveal.mp3'), { volume: 0.35 });
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }, 350);
    return () => clearTimeout(t);
  }, []);

  const ownedCount = entries.filter(e => !!(e.item.shop?.is_owned ?? e.item.has_purchased) || bought.includes(e.item.id)).length;
  if (!entry || !item) return null;
  const owned = !!(item.shop?.is_owned ?? item.has_purchased) || bought.includes(item.id);
  const worn = isItemWorn(player?.inventory, item);
  const name = itemDisplayName(item);
  const fx = fxKeyOf(item);
  const blurb = fx ? FX_BLURB[fx] : 'A members-only piece for your shark.';
  const leaving = visibleLeaving(item.shop, { secret: true, vipLocked: !member });
  const resting = still || paused || covered || !focused;

  return (
    <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 20 }]} showsVerticalScrollIndicator={false}>
      {/* Who you are in here, your Favorites and your coins: one slim row. */}
      <Animated.View entering={still ? undefined : FadeInDown.duration(240)} style={styles.topRow}>
        <View style={styles.badge} accessible accessibilityLabel={member ? 'You are a VIP member' : 'The VIP room. You can try everything on.'}>
          <GameIcon name={member ? 'member' : 'lock'} size={20} />
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.badgeText}>{member ? 'VIP ROOM' : 'VIP ONLY'}</Text>
        </View>
        <View style={{ flex: 1 }} />
        <Pressable onPress={onFavorites} hitSlop={6} accessibilityRole="button"
          accessibilityLabel={`Favorites, ${wishes} ${wishes === 1 ? 'item' : 'items'}`} style={styles.favs}>
          <WishHeart on={wishes > 0} size={20} />
          {wishes > 0 && <Text maxFontSizeMultiplier={1.2} style={styles.favsText}>{wishes}</Text>}
        </Pressable>
        <View style={styles.coins} accessible accessibilityLabel={`${formatCoins(balance)} coins`}>
          <GameIcon name="coins" size={20} />
          <Text maxFontSizeMultiplier={1.2} style={styles.coinsText}>{formatCoins(balance)}</Text>
        </View>
      </Animated.View>

      {!member && (
        <Animated.View entering={still ? undefined : FadeInDown.delay(60).duration(240)} style={styles.guest}
          accessible accessibilityLabel={`${SECRET_PREVIEW_COPY.title} ${SECRET_PREVIEW_COPY.body}`}>
          {/* Two balanced lines: the invite, then the promise (no lone word wrapping). */}
          <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.guestText, styles.guestStrong]}>{SECRET_PREVIEW_COPY.title}</Text>
          <Text maxFontSizeMultiplier={MAX_FONT} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} style={styles.guestText}>{SECRET_PREVIEW_COPY.body}</Text>
        </Animated.View>
      )}

      <Animated.View entering={still ? undefined : FadeInDown.duration(280)}>
        <VaultPanel padded={false} style={styles.panelWrap}>
          <Animated.View style={[{ height: stageH }, stageStyle]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpen(item, { bought: owned })} accessibilityRole="button"
              accessibilityLabel={`${name} on your shark. Tap to see it up close.`}>
              <ShopStage rim={V.gold} backdropUrl={stage?.scene ? null : stage?.backdrop} tone="night" sky={false} rays={V.inkGold}
                still={resting} plinth={stage?.scene ? 'none' : 'secret'}
                backdrop={stage?.scene ? <FxSceneBackdrop fxKey={stage.scene} still={resting} /> : undefined}>
                {!stage?.scene && <StarMotes still={resting} />}
                {stage ? <Playercard inventory={stage.look} still={resting} showBackground={false} pinAnchor="body" shadow
                  shadowAt={card.shadow} liftRoom={Math.max(0, card.box.top - 40)} style={cardStyle} popLayers fxSound={!resting}
                  fxTapToPlay /> : <View style={styles.flat}><TileArt item={item} size={200} thumb={false} still={resting} /></View>}
              </ShopStage>
            </Pressable>
            {/* The entry moment: one gold light sweep across the room. */}
            {!still && <View pointerEvents="none" style={StyleSheet.absoluteFill}><Sheen still={false} delay={350} width={INNER_W + 120} /></View>}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flare, flareStyle]} />
            <View style={styles.stageTop} pointerEvents="box-none">
              <ShelfChip entry={entry} offset={offset} />
              <StageHeart item={item} onWish={onWish} />
            </View>
          </Animated.View>

          <View style={styles.plate}>
            <Animated.View key={item.id} entering={still ? undefined : FadeIn.duration(180)}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{name}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.blurb} numberOfLines={2}>{blurb}</Text>
            </Animated.View>
            <View style={styles.actions}>
              {owned ? (
                <View style={styles.yours}><GameIcon name="check" size={18} /><Text maxFontSizeMultiplier={MAX_FONT} style={styles.yoursText}>{worn ? 'WEARING' : 'YOURS'}</Text></View>
              ) : (
                <View style={styles.price} accessible accessibilityLabel={`${formatCoins(item.cost)} coins${member ? '' : ', VIP members can buy'}`}>
                  <GameIcon name="coins" size={20} />
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.priceText}>{formatCoins(item.cost)}</Text>
                  {!member && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.priceVip}>for VIP</Text>}
                </View>
              )}
              {leaving && !owned && (
                <View style={styles.leaving} accessible accessibilityLabel={leavingSay(leaving)}>
                  <GameIcon name={leavingIcon(leaving)} size={13} />
                  {/* Always with its day, never a bare LEAVING (monetization round 2). */}
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.leavingText}>{`${leaving.forever ? 'LAST DAY' : 'LEAVES'} ${(shortDate(leaving.on) ?? '').toUpperCase()}`.trim()}</Text>
                </View>
              )}
              <View style={{ flex: 1 }} />
              {owned ? (worn ? null : <ShopCta label="Wear it" icon="check" width={170} still={still} onPress={() => onOpen(item, { bought: true })} />)
                : member ? <ShopCta label="Get it" width={170} still={still} onPress={() => onOpen(item, { confirm: true })} />
                : <VaultSecondaryButton label="See VIP" icon="member" onPress={() => { void openMembership(); }}
                    accessibilityLabel="See VIP" />}
            </View>
          </View>
        </VaultPanel>
      </Animated.View>

      <Animated.View entering={still ? undefined : FadeInUp.delay(120).duration(260)}>
        <View style={styles.railHead}>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.railTitle}>IN THE ROOM TODAY</Text>
          <Text maxFontSizeMultiplier={MAX_FONT} style={styles.railHint}>{ownedCount > 0 ? `${ownedCount} of ${entries.length} are yours` : 'Tap one to put it on'}</Text>
        </View>
        <ScrollView ref={rail} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>
          {entries.map(e => (
            <RailTile key={e.item.id} entry={e} selected={e.item.id === item.id} member={member} still={resting}
              owned={!!(e.item.shop?.is_owned ?? e.item.has_purchased) || bought.includes(e.item.id)} onPick={pick} />
          ))}
        </ScrollView>
      </Animated.View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingTop: 8, gap: 10 },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: 40 },
  // A plain label, not a second chip next to the shelf chip (art director round 2).
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 2, paddingRight: 6, height: 36 },
  badgeText: { fontFamily: FONT.display, fontSize: 14, color: V.inkGold, letterSpacing: 0.8 },
  favs: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 36, paddingHorizontal: 10, borderRadius: 18,
    backgroundColor: '#fff0f5', borderWidth: 2, borderColor: '#ff4f8b' },
  favsText: { fontFamily: FONT.display, fontSize: 14, color: '#c2185b' },
  coins: { flexDirection: 'row', alignItems: 'center', gap: 5, height: 36, paddingHorizontal: 11, borderRadius: 18,
    backgroundColor: V.card, borderWidth: 2, borderColor: '#ffffff' },
  coinsText: { fontFamily: FONT.display, fontSize: 16, color: '#ffffff' },
  guest: { marginHorizontal: 14, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(8,22,56,0.75)',
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.25)' },
  guestText: { fontFamily: FONT.body, fontSize: 15, lineHeight: 19, color: V.inkSoft, textAlign: 'center' },
  guestStrong: { fontFamily: FONT.display, color: V.ink },
  panelWrap: { marginBottom: 0 },
  flat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  flare: { borderTopLeftRadius: 21, borderTopRightRadius: 21, borderWidth: 5, borderColor: V.gold, borderBottomWidth: 0 },
  stageTop: { position: 'absolute', top: 10, left: 10, right: 10, flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  shelfChip: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1, height: 32, paddingLeft: 8, paddingRight: 12, borderRadius: 16,
    backgroundColor: 'rgba(5,12,34,0.72)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.45)' },
  shelfName: { fontFamily: FONT.display, fontSize: 13, color: V.inkGold, letterSpacing: 0.8, flexShrink: 1 },
  shelfDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: V.inkSoft, opacity: 0.8 },
  shelfWhen: { fontFamily: FONT.display, fontSize: 13, color: V.ink },
  heart: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.94)',
    borderWidth: 2, borderColor: '#ff9fbf' },
  heartOn: { borderColor: '#ff4f8b' },
  plate: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 14, gap: 4 },
  name: { fontFamily: FONT.display, fontSize: 28, lineHeight: 33, color: V.ink, textAlign: 'center', letterSpacing: 0.4,
    textShadowColor: V.lip, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0.1 },
  blurb: { fontFamily: FONT.body, fontSize: 16, lineHeight: 20, color: V.inkSoft, textAlign: 'center' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10, minHeight: 50 },
  // Plain price text, so the button is the one tappable thing in the row (kids UX round 2).
  price: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4, height: 40 },
  priceVip: { fontFamily: FONT.display, fontSize: 13, color: V.inkSoft },
  priceText: { fontFamily: FONT.display, fontSize: 21, color: V.inkGold },
  yours: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 14, height: 40, borderRadius: 20,
    backgroundColor: '#1f9d55', borderWidth: 2, borderColor: '#ffffff' },
  yoursText: { fontFamily: FONT.display, fontSize: 16, color: '#ffffff' },
  leaving: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: V.well, borderRadius: 8, borderWidth: 1.5, borderColor: V.gold,
    paddingHorizontal: 6, paddingVertical: 2 },
  leavingText: { fontFamily: FONT.display, fontSize: 12, color: V.inkGold, letterSpacing: 0.6 },
  railHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 16, marginTop: 4 },
  railTitle: { fontFamily: FONT.display, fontSize: 16, color: V.inkGold, letterSpacing: 1 },
  railHint: { fontFamily: FONT.body, fontSize: 15, color: V.inkSoft },
  rail: { gap: 12, paddingHorizontal: RAIL_PAD, paddingTop: 10, paddingBottom: 8 },
  tile: { width: TILE, height: TILE + 34, borderRadius: 18, borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)', backgroundColor: V.panelDeep },
  // A static gold ring (no animated shadow: that costs an offscreen pass on iOS, performance round 1).
  tileOn: { borderWidth: 3.5, borderColor: V.gold },
  tileClip: { ...StyleSheet.absoluteFillObject, borderRadius: 16, overflow: 'hidden' },
  tileGloss: { position: 'absolute', left: 0, right: 0, top: 0, height: '40%' },
  tileArt: { position: 'absolute', left: 0, right: 0, top: 4, height: TILE - 22, alignItems: 'center', justifyContent: 'center' },
  tileKind: { position: 'absolute', top: 5, left: 5, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(5,12,34,0.8)' },
  tileName: { position: 'absolute', left: 4, right: 4, bottom: 30, textAlign: 'center', fontFamily: FONT.display, fontSize: 12, color: '#ffffff' },
  tilePrice: { position: 'absolute', bottom: 6, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, height: 22,
    borderRadius: 11, backgroundColor: V.well },
  tileOwned: { backgroundColor: '#1f9d55' },
  tilePriceText: { fontFamily: FONT.display, fontSize: 13, color: '#ffffff' },
});
