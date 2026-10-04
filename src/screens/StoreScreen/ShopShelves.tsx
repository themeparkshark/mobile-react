/**
 * Shark Shop v2 gear shelves (shop-v2/CONTRACT.md).
 *
 * Top to bottom:
 * 1. One "You finished N sets!" card when sets wait for their title.
 * 2. The Featured hero stage: this week's star on your own shark, alone and spotlit.
 * 3. Event banners with key art, two honest timers and a "Next:" tease.
 * 4. The rest of Featured with "complete the look" callouts.
 * 5. Daily.
 *
 * Everyone sees the same shelves. A tile bought this visit stays put and
 * stamps OWNED. On the first open of a shop day, today's new items wear NEW!.
 *
 * Performance:
 * - Hearts live in a tiny store keyed by item id (wishStore), so a heart tap
 *   re-renders one tile and the wishlist pill.
 * - Timer pills own their own minute tick, on server time.
 * - Grids, banners and the hero are memoized with stable props.
 * - EXPO_PUBLIC_SHOP_PROFILE=1 logs React Profiler commits per tile.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { AppState, Dimensions, ImageBackground, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Animated, {
  FadeInUp, FadeOutUp, LinearTransition, runOnJS, type SharedValue, useAnimatedReaction, useAnimatedRef, useAnimatedScrollHandler, useSharedValue,
} from 'react-native-reanimated';
import { claimShopSet } from '../../api/endpoints/me/shop-sets';
import getShopToday from '../../api/endpoints/stores/today';
import updatePlayer from '../../api/endpoints/me/update-player';
import { addToWishlist, removeFromWishlist } from '../../api/endpoints/me/wishlist';
import Playercard from '../../components/Playercard';
import { AuthContext } from '../../context/AuthProvider';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import {
  activeShelf, dailyPill, dropReveal, emptyShelvesCopy, eventChips, fallbackBannerCopy, eventDropPill, eventEndPill, eventKicker, fallbackPollMs, featuredPill, formatCoins, HERO, heroItem, heroLayout,
  heroChips, heroPriceRow, inkOn, newCountLabel, pieceState, queueReveal, readySummary, restockBackoffMs, rewardPendingFor, sectionAccent, setA11y, setProgressText,
  settleClaims, shortDate, stableOrder, startFallbackPoll, wishSavedCopy,
} from '../../helpers/shopShelves';
import { isItemWorn, itemDisplayName, wearableBadge } from '../../helpers/wardrobe';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { ShopItem, ShopSection, ShopSetReward, ShopSetSummary, ShopTease, ShopToday } from '../../models/shop-today';
import { BRAND, FONT, GameButton, GameDialog, GameIcon, SHADOW, type GameIconName } from '../../ui';
import SetCompleteReveal from './SetCompleteReveal';
import ShopTile, { TileArt } from './ShopTile';
import TryOnSheet, { asWearable, previewLook } from './TryOnSheet';
import { MAX_FONT, NIGHT_SKY, PieceChip, REVEAL_NAVY, SHOP_SURFACE, Sheen, ShopCta, ShopStage, ShopToast, TimerPill, useShopNow, useShopToast } from './shopUi';

function ShopCtaInline({ label, onPress, busy }: { label: string; onPress: () => void; busy: boolean }) {
  const still = useReducedGameMotion();
  return <ShopCta label={label} icon="crown" width={Math.min(300, SCREEN_W - 80)} onPress={onPress} loading={busy} still={still} />;
}
import { FxSceneBackdrop } from '../../fx/FxSolo';
import { SECRET_THEME } from '../../fx/secretTheme';
import { GrownUpGateHost, SecretPreviewBanner, StarMotes } from './SecretShopUi';
import { FxPauseContext } from '../../fx/FxStage';
import { ShopProfile } from './shopProfile';
import { wishStore } from './wishStore';

const SCREEN_W = Dimensions.get('window').width;
const GAP = 12;
// Panel: 10pt margin + 3pt border each side, grid padding 8pt each side.
const GRID_PAD = 8;
const TILE_W = Math.floor((SCREEN_W - 2 * (10 + 3 + GRID_PAD) - GAP * 2) / 3);
const EVENT_TILE_W = Math.min(124, TILE_W + 8);
// Secret Shop shelves hold 1 to 3 pieces: two big showcase tiles a row, centred, so an animated piece
// has room to move and a short shelf never reads as half empty (secret-shop/DESIGN.md 6.3).
const SECRET_TILE_W = Math.floor((SCREEN_W - 2 * (10 + 3 + GRID_PAD) - GAP) / 2);
// The hero card (heroLayout is shared with the layout test): kicker row, then text column and stage.
const HERO_L = heroLayout(SCREEN_W);
const HERO_H = HERO.kickerH + HERO_L.bodyH;
const FIRST_OPEN_KEY = 'shop:first-open-day';
/** The sticky shelf jump bar above the scroll. */
const JUMP_H = 58;
const PENDING_REVEALS_KEY = 'shop:pending-reveals';
// Hero stage: 62% of the card's inner width, under the kicker row; the tail rests on the plinth.
const HERO_CARD = HERO_L.card;
const HERO_CARD_STYLE = { position: 'absolute' as const, ...HERO_CARD.box };
const MINI_CARD_STYLE = { position: 'absolute' as const, left: 0, right: 0, top: 0, bottom: 0 };

type Open = { item: ShopItem; fullLook: boolean; bought: boolean; accent: string | null } | null;
type OpenFn = (item: ShopItem, opts?: { fullLook?: boolean; bought?: boolean; accent?: string | null }) => void;

const SectionPills = memo(function SectionPills({ section, offset, still, single = false }: { section: ShopSection; offset: number; still: boolean;
  /** One honest pill per shelf (the Secret Shop: no "new drop" next to "ends", kids UX round 1). */
  single?: boolean }) {
  const now = useShopNow(offset);
  if (section.type === 'daily') return <TimerPill pill={dailyPill(section, now)} still={still} />;
  if (section.type === 'featured') {
    const pill = featuredPill(section, now);
    // The Secret Vault flips at midnight: say "tomorrow", and leave "tonight" to Tonight's Pick alone (kids UX round 2).
    if (single && pill.label === 'New tonight') return <TimerPill pill={{ ...pill, label: 'New Vault tomorrow', urgent: false }} still={still} icon="moon" />;
    return <TimerPill pill={pill} still={still} />;
  }
  if (single) return <View style={styles.pills}><TimerPill pill={eventEndPill(section, now)} still={still} icon="pumpkin" /></View>;
  const drop = eventDropPill(section, now);
  return (
    <View style={styles.pills}>
      {drop && <TimerPill pill={drop} still={still} icon="gift" light />}
      <TimerPill pill={eventEndPill(section, now)} still={still} />
    </View>
  );
});

/** "Next: Bone Zone" with a few blacked-out piece shapes (honest: the real next set). */
const TeaseChip = memo(function TeaseChip({ tease, label }: { tease: ShopTease; label: string }) {
  const when = shortDate(tease.starts_on);
  return (
    <View style={styles.tease} accessible accessibilityLabel={`${label}, ${tease.title ?? tease.set_name ?? 'a surprise'}${when ? `, from ${when}` : ''}`}>
      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.teaseLabel}>{label}</Text>
      <Text maxFontSizeMultiplier={MAX_FONT} style={styles.teaseName} numberOfLines={1}>{tease.title ?? tease.set_name ?? '???'}</Text>
      <View style={styles.teaseShapes}>
        {(tease.silhouettes.length ? tease.silhouettes : [null]).slice(0, 3).map((url, i) => url
          ? <Image key={i} source={url} style={styles.teaseShape} contentFit="contain" tintColor="#0a2350" />
          : <Text key={i} style={styles.teaseQ}>?</Text>)}
      </View>
    </View>
  );
});

const Grid = memo(function Grid({ items, vip, balance, still, bought, quiet = false, flipIn = false, width = TILE_W, horizontal = false, centered = false, onOpen, onWish }: {
  items: ShopItem[]; vip: boolean; balance: number; still: boolean; bought: number[]; quiet?: boolean; centered?: boolean;
  /** First open of the shop day: tiles flip in one by one. */
  flipIn?: boolean; width?: number; horizontal?: boolean;
  onOpen: (item: ShopItem) => void; onWish: (item: ShopItem) => void;
}) {
  const tiles = items.map((item, i) => (
    <ShopProfile key={item.id} id={`tile-${item.id}`}>
      <Animated.View entering={flipIn && !still ? FadeInUp.delay(120 + i * 70).springify().damping(14) : undefined}>
        <ShopTile item={item} width={width} still={still} quiet={quiet}
          vipLocked={!!item.is_member_item && !vip} affordable={balance >= item.cost} justBought={bought.includes(item.id)}
          onOpen={onOpen} onWish={onWish} />
      </Animated.View>
    </ShopProfile>
  ));
  return horizontal
    ? <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.eventRow}>{tiles}</ScrollView>
    : <View style={[styles.grid, centered && { justifyContent: 'center' }]}>{tiles}</View>;
});

/** Your shark in the set, small (completed callouts). */
const SetPortrait = memo(function SetPortrait({ set }: { set: ShopSetSummary }) {
  const { player } = useContext(AuthContext);
  const stage = useMemo(() => previewLook(player?.inventory, (set.pieces ?? []).map(asWearable), 'base'), [player?.inventory?.skin_item?.id, set.slug]);
  if (!stage) return null;
  return (
    <View style={[styles.portrait, { borderColor: set.color ?? BRAND.gold }]}>
      <Playercard inventory={stage.look} still showBackground={false} pinAnchor="body" shadow style={MINI_CARD_STYLE} />
    </View>
  );
});

const SetCallout = memo(function SetCallout({ set, todayIds, onTry }: {
  set: ShopSetSummary; todayIds: number[]; onTry: (set: ShopSetSummary) => void;
}) {
  const done = set.reward_state === 'claimed';
  const color = set.color ?? BRAND.gold;
  return (
    <Pressable onPress={() => onTry(set)} accessibilityRole="button" accessibilityLabel={setA11y(set)}
      style={[styles.setCard, { borderColor: color }]}>
      <View style={styles.setHead}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setTitle} numberOfLines={1}>{set.name}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.setCount}>{setProgressText(set)}</Text>
      </View>
      {/* One segment per piece, filled in the set colour. */}
      <View style={styles.segments}>
        {Array.from({ length: set.total }, (_, i) => (
          <View key={i} style={[styles.segment, i < set.owned && { backgroundColor: color }]} />
        ))}
      </View>
      <View style={styles.setRow}>
        {done && <SetPortrait set={set} />}
        <View style={{ flex: 1, gap: 8 }}>
          <View style={styles.setPieces}>
            {(set.pieces ?? []).map(piece => (
              <View key={piece.id} style={!piece.owned && { opacity: 0.55 }}>
                <PieceChip piece={piece} state={pieceState(piece, todayIds)} size={50} />
              </View>
            ))}
          </View>
          <View style={styles.chips}>
            {set.title && <View style={styles.titleChip}><GameIcon name="crown" size={15} />
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.titleChipText}>{set.title}</Text></View>}
            {set.xp_reward > 0 && !done && <View style={styles.xpChip}><GameIcon name="xp" size={15} />
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.xpChipText}>+{set.xp_reward} XP</Text></View>}
            {done && <View style={styles.doneChip}><GameIcon name="check" size={15} />
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.doneText}>Yours</Text></View>}
          </View>
        </View>
      </View>
    </Pressable>
  );
});

/** Every set waiting for its title in one card (stacked, no hidden pages), with one "Claim all". */
const ReadyCard = memo(function ReadyCard({ sets, todayIds, busy, onClaimAll }: {
  sets: ShopSetSummary[]; todayIds: number[]; busy: boolean; onClaimAll: () => void;
}) {
  const summary = readySummary(sets);
  if (!summary) return null;
  const shown = sets.slice(0, 3);
  return (
    <View style={[styles.setCard, styles.readyCard]}>
      <View style={styles.setHead}>
        <GameIcon name="trophy" size={24} />
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.readyTitle} numberOfLines={1}>{summary.title}</Text>
      </View>
      {shown.map(set => (
        <View key={set.slug} style={styles.readySet}>
          <View style={styles.readyRow}>
            {(set.pieces ?? []).slice(0, 5).map(piece => <PieceChip key={piece.id} piece={piece} state={pieceState(piece, todayIds)} size={40} />)}
          </View>
          {set.title && <View style={[styles.titleChip, { alignSelf: 'flex-start' }]}><GameIcon name="crown" size={15} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.titleChipText}>{set.title}</Text></View>}
        </View>
      ))}
      {sets.length > shown.length && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.readyMore}>and {sets.length - shown.length} more</Text>}
      <View style={{ alignItems: 'center' }}>
        <ShopCtaInline label={sets.length > 1 ? `Claim all ${sets.length}!` : 'Claim your title!'} onPress={onClaimAll} busy={busy} />
      </View>
    </View>
  );
});

const EventBanner = memo(function EventBanner({ section, offset, still, vip, balance, bought, flipIn, todayIds, setsBySlug, onOpen, onWish, onTrySet, secret = false }: {
  section: ShopSection; offset: number; still: boolean; vip: boolean; balance: number; bought: number[]; flipIn: boolean; secret?: boolean;
  todayIds: number[]; setsBySlug: Map<string, ShopSetSummary>;
  onOpen: OpenFn; onWish: (item: ShopItem) => void; onTrySet: (set: ShopSetSummary) => void;
}) {
  const accent = sectionAccent(section);
  const ink = section.art_url || secret ? '#ffffff' : inkOn(accent);
  const openHere = useCallback((item: ShopItem) => onOpen(item, { accent }), [onOpen, accent]);
  return (
    <View style={[styles.event, { backgroundColor: secret ? SECRET_THEME.panel : accent }, secret && { borderColor: SECRET_THEME.border }]}>
      {/* The Secret Shop keeps its midnight: the season glows up from the bottom instead of a flat colour. */}
      {secret && <LinearGradient pointerEvents="none" colors={[SECRET_THEME.panel, `${accent}cc`]} locations={[0.15, 1]} style={StyleSheet.absoluteFill} />}
      {/* Halloween: a drawn moon and two friendly bats in the corner (pipeline art). */}
      {secret && section.event_key === 'halloween' && <Image source={MOON_BATS} style={styles.moonBats} contentFit="contain" />}
      {secret ? null : section.art_url ? (
        <ImageBackground source={{ uri: section.art_url }} resizeMode="cover" style={styles.eventArt}>
          <LinearGradient colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0)', accent]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
        </ImageBackground>
      ) : <View style={styles.eventShine} pointerEvents="none" />}
      <View style={styles.eventHead}>
        <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.eventKicker, { color: section.last_chance ? '#ffe07a' : ink }]}>{eventKicker(section, secret)}</Text>
        <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.eventTitle, { color: ink }]} numberOfLines={1}>{section.title}</Text>
        {section.subtitle && section.subtitle !== section.wave?.title ? (
          <Text maxFontSizeMultiplier={MAX_FONT} style={[styles.eventSub, { color: ink }]} numberOfLines={2}>{section.subtitle}</Text>
        ) : null}
        <SectionPills section={section} offset={offset} still={still} single={secret} />
        {section.next_wave && !secret && <View style={{ marginTop: 8 }}><TeaseChip tease={section.next_wave} label="NEXT" /></View>}
      </View>
      <Grid items={section.items} vip={vip} balance={balance} still={still} bought={bought} quiet={!!section.quiet_tiles} flipIn={flipIn}
        width={secret ? SECRET_TILE_W : EVENT_TILE_W} horizontal={!secret} centered={secret} onOpen={openHere} onWish={onWish} />
      {section.set_slugs.map(slug => setsBySlug.get(slug)).filter((s): s is ShopSetSummary => !!s).map(set => (
        <SetCallout key={set.slug} set={set} todayIds={todayIds} onTry={onTrySet} />
      ))}
    </View>
  );
});

/** One chip per shelf: icons, not words (a 7-year-old jumps without reading). */
type ShelfChip = { key: string; icon: GameIconName; label: string; fill?: string | null; ring?: string | null };

/**
 * The jump bar owns the highlight: it follows the scroll on the UI thread and re-renders only
 * itself, never the shelves. Every chip keeps a fixed 50pt box; the active one only scales, so the
 * row never shifts.
 */
const JumpBar = memo(function JumpBar({ chips, tops, scrollY, maxY, onJump, floor }: {
  chips: ShelfChip[]; tops: SharedValue<number[]>; scrollY: SharedValue<number>; maxY: SharedValue<number>; onJump: (i: number) => void;
  /** The screen floor colour (brand blue, or the Secret Shop's midnight). */
  floor?: string;
}) {
  const [active, setActive] = useState(0);
  useAnimatedReaction(() => activeShelf(tops.value, scrollY.value, 24, maxY.value), (next, prev) => {
    if (next !== prev) runOnJS(setActive)(next);
  });
  if (chips.length < 2) return null;
  return (
    <View style={[styles.jumpBar, floor ? { backgroundColor: floor } : null]} accessibilityRole="tablist">
      {chips.map((chip, i) => {
        const on = i === active;
        return (
          <Pressable key={chip.key} onPress={() => { setActive(i); onJump(i); }} hitSlop={4} accessibilityRole="tab"
            accessibilityState={{ selected: on }} accessibilityLabel={`Jump to ${chip.label}`} style={styles.jumpSlot}>
            <View style={[styles.jumpChip, chip.fill ? { backgroundColor: chip.fill } : null, chip.ring ? { borderColor: chip.ring } : null,
              on && styles.jumpChipOn]}>
              <GameIcon name={chip.icon} size={24} />
            </View>
          </Pressable>
        );
      })}
    </View>
  );
});

const Hero = memo(function Hero({ item, set, section, offset, still, todayItems, tease, onOpen, secret = false }: {
  item: ShopItem; set: ShopSetSummary | null; section: ShopSection; offset: number; still: boolean;
  todayItems: ShopItem[]; tease: ShopTease | null | undefined; onOpen: OpenFn;
  /** The Secret Shop's Vault: midnight stage, the piece live on your shark. */
  secret?: boolean;
}) {
  const { player } = useContext(AuthContext);
  const badge = wearableBadge(item);
  const glow = badge.border === '#FFFFFF' ? BRAND.gold : badge.border;
  const owned = !!(item.shop?.is_owned ?? item.has_purchased);
  const worn = isItemWorn(player?.inventory, item);
  const pieces = set?.pieces ?? [];
  // The star alone on your shark's own skin: the brightest thing in the panel.
  const stage = useMemo(() => previewLook(player?.inventory, [{ id: item.id, name: item.name, icon_url: item.icon_url,
    paper_url: item.paper_url, no_eye_url: item.no_eye_url, item_type: item.item_type, fx_key: item.fx_key ?? null }], 'base'),
    [player?.inventory?.skin_item?.id, item.id]);
  // As many 36pt chips as the measured text column holds; more shows "+N".
  const chips = heroChips(pieces.length, HERO_L.chips);
  const priceRow = heroPriceRow(HERO_L.textW, formatCoins(item.cost), badge.label);

  const openPiece = (pieceId: number) => {
    const onShelf = todayItems.find(i => i.id === pieceId);
    onOpen(onShelf ?? item, { fullLook: !onShelf });
  };

  return (
    <View style={[styles.hero, secret && { backgroundColor: SECRET_THEME.panel }, { height: HERO_H + (tease ? 44 : 0), borderColor: secret ? SECRET_THEME.gold : glow }]}>
      {/* House blue like the panels: the lit plinth on a night stage is the one bright object. */}
      <LinearGradient colors={secret ? [...SECRET_THEME.sky] : [...NIGHT_SKY]} style={StyleSheet.absoluteFill} />
      {secret && <StarMotes still={still} />}
      <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpen(item, { bought: owned })} accessibilityRole="button"
        accessibilityLabel={secret
          ? `The Vault: ${itemDisplayName(item)}, moves on your shark. ${owned ? (worn ? "You're wearing it." : 'Yours. Tap to wear it.')
            : `${formatCoins(item.cost)} Shark Coins${player?.is_subscribed ? '' : ', VIP members can buy'}. Tap to try it on.`}`
          : `This week's star: ${itemDisplayName(item)}${badge.label ? `, ${badge.label.toLowerCase()}` : ''}. ${owned ? (worn ? "You're wearing it." : 'Yours. Tap to wear it.') : `${formatCoins(item.cost)} Shark Coins. Tap to try it on.`}`}>
        <View style={styles.heroStage}>
          <ShopStage rim={secret ? SECRET_THEME.gold : glow} backdropUrl={stage?.scene ? null : stage?.backdrop} tone="night" sky={false} still={still}
            plinth={stage?.scene ? 'none' : secret ? 'secret' : 'house'}
            backdrop={stage?.scene ? <FxSceneBackdrop fxKey={stage.scene} still={still} /> : undefined}>
            {stage ? <Playercard inventory={stage.look} still={still} showBackground={false} pinAnchor="body" shadow shadowAt={HERO_CARD.shadow} style={HERO_CARD_STYLE} />
              : <View style={styles.heroFlat}><TileArt item={item} size={170} thumb={false} /></View>}
          </ShopStage>
        </View>
      </Pressable>
      {/* Kicker row: the label and the timer pill share one line above the stage, never on the hat. */}
      <View style={styles.heroKickerRow} pointerEvents="none">
        <Text maxFontSizeMultiplier={MAX_FONT} numberOfLines={1} style={styles.heroKicker}>{secret ? 'THE VAULT' : "THIS WEEK'S STAR"}</Text>
        <SectionPills section={section} offset={offset} still={still} single={secret} />
      </View>
      <View style={styles.heroText} pointerEvents="box-none">
        <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroName} numberOfLines={2}>{itemDisplayName(item)}</Text>
        {set && <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroSet} numberOfLines={1}>{set.name}: {setProgressText(set)}</Text>}
        {pieces.length > 1 && (
          <View style={styles.heroPieces}>
            {pieces.slice(0, chips.shown).map(p => (
              <PieceChip key={p.id} piece={p} state={pieceState(p, todayItems.map(i => i.id))} size={HERO.pieces} onPress={() => openPiece(p.id)} />
            ))}
            {chips.more > 0 && <View style={styles.heroMore}><Text style={styles.heroMoreText}>+{chips.more}</Text></View>}
          </View>
        )}
        {/* Price and rarity right under the chips (no dead column); only the button sits at the bottom. */}
        {!owned && (
          <View style={styles.heroPrice}><GameIcon name="coins" size={18} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroPriceText}>{formatCoins(item.cost)}</Text>
            {/* One marker everywhere: a lock on the price when only VIP members can buy it. */}
            {secret && !player?.is_subscribed && <GameIcon name="lock" size={18} />}
            {badge.label ? (priceRow === 'inline' ? <View style={[styles.heroRarity, { backgroundColor: badge.labelColor }]}>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroRarityText}>{badge.label}</Text></View>
              : <View style={[styles.heroRarityDot, { backgroundColor: badge.labelColor }]} />) : null}
          </View>
        )}
        {secret && !!item.fx_key && (
          // Kids can't see "animated" in a still: say it with an icon and three words.
          <View style={styles.heroMoves} accessible accessibilityLabel="This piece moves on your shark">
            <GameIcon name="sparkle" size={16} />
            <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroMovesText}>Moves on your shark</Text>
          </View>
        )}
        <View style={{ marginTop: 'auto' }}>
          {owned ? (
            worn ? (
              <View style={styles.wearingChip}><GameIcon name="check" size={18} /><Text maxFontSizeMultiplier={MAX_FONT} style={styles.wearingText}>WEARING</Text></View>
            ) : (
              <Pressable onPress={() => onOpen(item, { bought: true })} style={styles.heroGhost} accessibilityRole="button">
                <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroGhostText}>WEAR IT</Text>
              </Pressable>
            )
          ) : (
            <Pressable onPress={() => onOpen(item)} style={styles.heroCta} accessibilityRole="button">
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.heroCtaText}>TRY IT ON</Text>
            </Pressable>
          )}
        </View>
      </View>
      {tease && <View style={styles.heroTease} pointerEvents="none"><TeaseChip tease={tease} label="NEXT WEEK" /></View>}
    </View>
  );
});

export default function ShopShelves({ today, setToday, onRefresh, offset, focusRequest, scrollY, onHandoff, secret = false }: {
  readonly today: ShopToday;
  readonly setToday: Dispatch<SetStateAction<ShopToday | null>>;
  readonly onRefresh: () => Promise<boolean>;
  /** Server clock minus device clock, measured at load. */
  readonly offset: number;
  /** Open this item's try-on (wishlist push or My Wishlist). A new nonce re-opens the same item. */
  readonly focusRequest?: { id: number; nonce: number } | null;
  /** The screen collapses its header from this. */
  readonly scrollY?: SharedValue<number>;
  /** The buy hand-off into a Set Complete reveal: the screen covers everything (header too) in navy. */
  readonly onHandoff?: (on: boolean) => void;
  /** The members-only Secret Shop (secret-shop/DESIGN.md 6): same shelves, midnight look, VIP preview banner. */
  readonly secret?: boolean;
}) {
  const { player } = useContext(AuthContext);
  const { playSound: playSoundNow } = useContext(SoundEffectContext);
  // Stable sound callback: the provider's value changes identity, our handlers must not.
  const soundRef = useRef(playSoundNow);
  soundRef.current = playSoundNow;
  const playSound = useCallback((sound: number, options?: { volume?: number }) => soundRef.current(sound, options), []);
  const still = useReducedGameMotion();
  const [open, setOpen] = useState<Open>(null);
  const [reveals, setReveals] = useState<{ reward: ShopSetReward; set: ShopSetSummary | null }[]>([]);
  const [askAlerts, setAskAlerts] = useState(false);
  const [bought, setBought] = useState<number[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [firstOpenToday, setFirstOpenToday] = useState(false);
  const [toast, setToast] = useShopToast();
  const vip = !!player?.is_subscribed;
  const balance = Number(player?.coins ?? 0);

  // The wishlist store follows the server copy (never a per-tap re-render of the shelves).
  useEffect(() => { wishStore.seed(today.wishlist_ids ?? [], today.wishlist_alerts); }, [today.wishlist_ids, today.wishlist_alerts]);

  // The first open of each shop day gets a moment: tiles flip in one by one and the Daily header shines.
  useEffect(() => {
    let live = true;
    void AsyncStorage.getItem(FIRST_OPEN_KEY).then(seen => {
      if (!live || seen === today.shop_day) return;
      setFirstOpenToday(true);
      void AsyncStorage.setItem(FIRST_OPEN_KEY, today.shop_day).catch(() => undefined);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [today.shop_day]);

  const restored = useRef(false);
  // A Set Complete won but not yet shown (the app closed mid-celebration) plays on the next open.
  useEffect(() => {
    void AsyncStorage.getItem(PENDING_REVEALS_KEY).then(raw => {
      const saved = raw ? (JSON.parse(raw) as { reward: ShopSetReward; set: ShopSetSummary | null }[]) : [];
      restored.current = true;
      // Always a new array, so the save effect runs once with the merged queue.
      setReveals(list => saved.reduce((acc, r) => (acc.some(x => x.reward.slug === r.reward.slug) ? acc : [...acc, r]), [...list]));
    }).catch(() => { restored.current = true; setReveals(list => [...list]); });
  }, []);
  // One queue (won during a buy, or from Claim all), saved from one place, so nothing overwrites anything.
  useEffect(() => {
    if (!restored.current) return;
    void AsyncStorage.setItem(PENDING_REVEALS_KEY, JSON.stringify(reveals)).catch(() => undefined);
  }, [reveals]);

  // A tile stays where the kid saw it for this visit (per shop day).
  const seenOrder = useRef<{ day: string; order: Record<string, number[]> }>({ day: '', order: {} });
  if (seenOrder.current.day !== today.shop_day) seenOrder.current = { day: today.shop_day, order: {} };
  const sections = useMemo(() => today.sections.map(section => {
    const ids = section.items.map(i => i.id);
    const seen = seenOrder.current.order[section.key];
    const order = stableOrder(ids, seen);
    if (!seen) seenOrder.current.order[section.key] = ids;
    const byId = new Map(section.items.map(i => [i.id, i]));
    return { ...section, items: order.map(id => byId.get(id)!).filter(Boolean) };
  }), [today.sections, today.shop_day]);

  const allItems = useMemo(() => sections.flatMap(s => s.items), [sections]);
  const todayIds = useMemo(() => allItems.map(i => i.id), [allItems]);
  const setsBySlug = useMemo(() => new Map([...(today.sets ?? []), ...(today.ready_sets ?? [])].map(s => [s.slug, s])), [today.sets, today.ready_sets]);

  // Prefetch the hero and event art so try-on and banners never pop in.
  useEffect(() => {
    const urls = sections.flatMap(s => [s.art_url, ...(s.type === 'event' || s.type === 'featured' ? s.items.slice(0, 4).map(i => i.paper_url) : [])])
      .filter((u): u is string => typeof u === 'string' && u.length > 0);
    if (urls.length) void Image.prefetch(urls, 'memory-disk').catch(() => undefined);
  }, [today.shop_day]);

  const openItem = useCallback<OpenFn>((item, opts = {}) => {
    playSound(require('../../../assets/sounds/reveal.mp3'), { volume: 0.6 });
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setOpen({ item, fullLook: !!opts.fullLook, bought: !!opts.bought, accent: opts.accent ?? null });
  }, [playSound]);
  const openTile = useCallback((item: ShopItem) => openItem(item), [openItem]);

  // Wishlist push or My Wishlist: open that item's try-on (every request, even the same item twice).
  useEffect(() => {
    if (!focusRequest) return;
    const item = allItems.find(i => i.id === focusRequest.id);
    if (item) setOpen({ item, fullLook: false, bought: false, accent: null });
  }, [focusRequest?.nonce]);

  // Stable heart: the store holds the truth per id; the server answer reconciles that id only.
  const wish = useCallback(async (item: ShopItem) => {
    const id = item.id;
    const adding = !wishStore.has(id);
    playSound(require('../../../assets/sounds/tap.mp3'));
    void Haptics.impactAsync(adding ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    wishStore.set(id, adding);
    if (adding && wishStore.alerts() == null) setAskAlerts(true);
    else if (adding) setToast(wishSavedCopy(wishStore.alerts()));
    try {
      const server = adding ? await addToWishlist(id) : await removeFromWishlist(id);
      wishStore.set(id, server.includes(id));
    } catch (error: unknown) {
      wishStore.set(id, !adding);
      const full = (error as { response?: { data?: { code?: string } } })?.response?.data?.code === 'wishlist_full';
      setToast(full ? 'Your wishlist is full. Remove one first.' : 'Couldn’t save that. Try again.');
    }
  }, [playSound, setToast]);

  const answerAlerts = useCallback(async (on: boolean) => {
    setAskAlerts(false);
    wishStore.setAlerts(on);
    setToast(wishSavedCopy(on));
    await updatePlayer({ wishlist_alerts: on }).catch(() => undefined);
  }, [setToast]);

  // The reward is the shelf's the moment the server grants it: closing the try-on early never loses it.
  const onPurchased = useCallback((item: ShopItem, reward: ShopSetReward | null, recovered?: 'set_complete') => {
    setBought(list => (list.includes(item.id) ? list : [...list, item.id]));
    // A recovered buy that finished a set, with no reward to replay: at least say so.
    if (recovered === 'set_complete') setToast('Set complete!');
    // Queued at once (never lost to an early close); it plays when the sheet has slid away.
    if (reward) {
      const entry = { reward, set: setsBySlug.get(reward.slug) ?? null };
      setReveals(list => queueReveal(list.map(x => ({ ...x, slug: x.reward.slug })), { ...entry, slug: reward.slug }).map(({ slug: _s, ...x }) => x));
    }
    void onRefresh();
  }, [onRefresh, setsBySlug, setToast]);

  // Has this player bought the item? Asks the server (a fresh shop), for "Check again".
  const checkOwned = useCallback(async (itemId: number): Promise<{ owns: boolean; set: ShopSetSummary | null } | null> => {
    const fresh = await getShopToday(today.store_id).catch(() => null);
    if (!fresh) return null;
    setToday(fresh);
    const onShelf = fresh.sections.some(sec => sec.items.some(i => i.id === itemId && (i.shop?.is_owned ?? i.has_purchased)));
    const allSets = [...(fresh.sets ?? []), ...(fresh.ready_sets ?? [])];
    const inSet = allSets.some(set => (set.owned_ids ?? []).includes(itemId));
    // The item's set, fresh: a recovered set-completing buy replays its reveal from this.
    const set = allSets.find(s => (s.item_ids ?? []).includes(itemId)) ?? null;
    return { owns: onShelf || inSet, set };
  }, [today.store_id, setToday]);

  const onWorn = useCallback((item: ShopItem) => setToast(`Now wearing ${itemDisplayName(item)}!`), [setToast]);

  // Claim all: the card leaves at once (failed claims come back), then the reveals play in order.
  const claimAll = useCallback(async () => {
    const ready = today.ready_sets ?? [];
    if (!ready.length || claiming) return;
    setClaiming(true);
    const results = await Promise.all(ready.map(set => claimShopSet(set.slug).then(r => r, () => null)));
    const { won, failed } = settleClaims(ready, results);
    setToday(t => (t ? { ...t, ready_sets: failed, ready_set_slugs: failed.map(f => f.slug) } as ShopToday : t));
    setClaiming(false);
    if (failed.length) setToast(failed.length === ready.length ? 'Couldn’t claim that yet. Try again.' : 'Some sets will be ready to claim in a moment.');
    const queue = won.map(({ set, reward }) => ({ reward: { ...reward, item_ids: reward.item_ids ?? set.item_ids }, set }));
    setReveals(list => [...list, ...queue]);
    void onRefresh();
  }, [today.ready_sets, claiming, onRefresh, setToday, setToast]);

  // iOS can't present a modal while the last one is still dismissing: hold the next reveal a beat.
  const [revealGate, setRevealGate] = useState(true);
  const holdReveal = useCallback(() => {
    setRevealGate(false);
    setTimeout(() => setRevealGate(true), 450);
  }, []);
  // The try-on is a modal too: it reports closed from iOS onDismiss (fully gone), so the reveal
  // presents at once. With a reveal waiting, a navy cover holds the shelf (the try-on's scrim has
  // already deepened to it) until the reveal is on screen: no idle shelf between payoff beats.
  const [handoff, setHandoff] = useState(false);
  const revealsRef = useRef(reveals);
  revealsRef.current = reveals;
  const openRef = useRef(open);
  openRef.current = open;
  const handoffRef = useRef(onHandoff);
  handoffRef.current = onHandoff;
  // The screen's cover and ours flip in the same tick (no frame with the header showing).
  const coverHandoff = useCallback((on: boolean) => { setHandoff(on); handoffRef.current?.(on); }, []);
  const leavingTryOn = useCallback(() => {
    if (!rewardPendingFor(revealsRef.current, openRef.current?.item.shop?.set?.slug)) return;
    coverHandoff(true);
    setTimeout(() => coverHandoff(false), 1500);
  }, [coverHandoff]);
  const closeTryOn = useCallback(() => {
    setOpen(null);
  }, []);
  // iOS can drop a modal presented while another is still leaving: if the reveal hasn't shown
  // within 1.2 s of mounting, remount it once the gate reopens (the reward is never lost).
  const shownRef = useRef<string | null>(null);
  const revealShown = useCallback(() => { shownRef.current = revealsRef.current[0]?.reward.slug ?? null; coverHandoff(false); }, [coverHandoff]);
  const revealSlug = reveals[0]?.reward.slug ?? null;
  const revealMounted = !!revealSlug && !open && revealGate;
  useEffect(() => {
    if (!revealMounted || shownRef.current === revealSlug) return;
    const t = setTimeout(() => { if (shownRef.current !== revealSlug) holdReveal(); }, 1200);
    return () => clearTimeout(t);
  }, [revealMounted, revealSlug]);
  const finishReveal = useCallback(() => {
    holdReveal();
    setReveals(list => (list[0] ? dropReveal(list.map(x => ({ ...x, slug: x.reward.slug })), list[0].reward.slug).map(({ slug: _s, ...x }) => x) : list));
  }, [holdReveal]);

  const trySet = useCallback((set: ShopSetSummary) => {
    const target = allItems.find(i => i.shop?.set?.slug === set.slug && !(i.shop?.is_owned ?? i.has_purchased))
      ?? allItems.find(i => i.shop?.set?.slug === set.slug);
    if (target) openItem(target, { fullLook: true });
  }, [allItems, openItem]);

  // Only poll while the kid is looking: the shop screen is focused and the app is in front.
  const focused = useIsFocused();
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setAppActive(state === 'active'));
    return () => sub.remove();
  }, []);
  const awake = focused && appActive;

  // At the reset the next day is already built server side: reload, retry with backoff on failure
  // (cancelled on cleanup, at most 8 tries, paused off screen).
  useEffect(() => {
    if (!awake) return;
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const due = Date.parse(today.resets_at) - (Date.now() + offset) + 2_000;
    const run = async () => {
      const ok = await onRefresh().catch(() => false);
      if (!ok && !cancelled && attempt < 8) timer = setTimeout(run, restockBackoffMs(attempt++));
    };
    timer = setTimeout(run, Math.max(1_000, due));
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [today.resets_at, offset, awake]);

  // Fallback (today is still building): ask again every 15 to 30 s until the real day is served.
  // Cancelled on cleanup, paused off screen and in the background, stops after 20 misses in a row,
  // and stops for good on a 404 (the shop's kill switch).
  const [pollStopped, setPollStopped] = useState(false);
  useEffect(() => { setPollStopped(false); }, [today.shop_day]);
  useEffect(() => {
    if (!today.fallback || !awake || pollStopped) return;
    return startFallbackPoll({
      refresh: async alive => {
        try {
          // null is the 404 (kill switch, or no engine): stop for good.
          const fresh = await getShopToday(today.store_id);
          if (!fresh) return 'gone';
          if (alive()) setToday(fresh);
          return fresh.fallback ? 'miss' : 'ok';
        } catch {
          return 'miss';
        }
      },
      delayMs: () => fallbackPollMs(Math.random()),
      onStop: () => setPollStopped(true),
    });
  }, [today.fallback, today.shop_day, today.store_id, awake, pollStopped]);

  // Shelf jump bar: each shelf's top in the scroll content, the active one follows the scroll.
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const shelfY = useSharedValue(0);
  const maxY = useSharedValue(Number.POSITIVE_INFINITY);
  const tops = useSharedValue<number[]>([]);
  const topsRef = useRef<Record<string, number>>({});
  const wrapY = useRef(0);
  const scrollHandler = useAnimatedScrollHandler(e => {
    shelfY.value = e.contentOffset.y;
    maxY.value = e.contentSize.height - e.layoutMeasurement.height;
    if (scrollY) scrollY.value = e.contentOffset.y;
  });

  const refresh = async () => {
    setRefreshing(true);
    // A pull is the kid asking again: a stopped fallback poll starts over.
    setPollStopped(false);
    try { await onRefresh(); } finally { setRefreshing(false); }
  };

  const events = sections.filter(s => s.type === 'event');
  const featured = sections.find(s => s.type === 'featured');
  const daily = sections.find(s => s.type === 'daily');
  const hero = featured ? heroItem(featured.hero_id, featured.items) : null;
  const heroSet = hero?.shop?.set ? setsBySlug.get(hero.shop.set.slug) ?? null : null;
  const featuredRest = useMemo(() => (featured ? featured.items.filter(item => item.id !== hero?.id) : []), [featured, hero?.id]);
  const readySets = today.ready_sets ?? [];
  const openSet = open?.item.shop?.set ? setsBySlug.get(open.item.shop.set.slug) ?? null : null;
  const enter = (i: number) => (still ? undefined : FadeInUp.delay(60 * i).springify().damping(16));
  const reveal = reveals[0] ?? null;
  const dailyNew = newCountLabel(daily?.new_count);
  const empty = !featured && !daily && events.length === 0 ? emptyShelvesCopy(today.fallback) : null;
  // A fallback day (or a tease with no name) shows no "NEXT WEEK ???" placeholder.
  const heroTease = !today.fallback && (today.next_featured?.title || today.next_featured?.set_name) ? today.next_featured : null;

  const chipSig = [featured && hero ? 'hero' : '', ...events.map(e => `${e.key}:${e.title}:${e.art_url ?? ''}:${e.color ?? ''}`),
    featured && featuredRest.length ? 'featured' : '', daily ? 'daily' : ''].join('|');
  // Stable between renders (same shelves, same array), so the memoized jump bar never re-renders for nothing.
  const chips: ShelfChip[] = useMemo(() => {
    const looks = eventChips(events);
    return [
      ...(featured && hero ? [{ key: 'hero', icon: 'star' as const, label: secret ? 'the Vault' : "this week's star" }] : []),
      ...events.map((e, i) => ({ key: e.key, icon: looks[i].icon as GameIconName, label: e.title, fill: looks[i].fill, ring: looks[i].ring })),
      ...(featured && featuredRest.length ? [{ key: 'featured', icon: 'crown' as const, label: secret ? 'More in the Vault' : 'Featured' }] : []),
      ...(daily ? [{ key: 'daily', icon: 'timer' as const, label: secret ? "Tonight's Pick" : 'Daily' }] : []),
    ];
  }, [chipSig]);
  const chipKeys = chips.map(c => c.key).join('|');
  const syncTops = () => { tops.value = chips.map(c => (topsRef.current[c.key] ?? 0) + wrapY.current); };
  const measure = (key: string) => (e: { nativeEvent: { layout: { y: number } } }) => {
    topsRef.current[key] = e.nativeEvent.layout.y;
    syncTops();
  };
  useEffect(() => { syncTops(); }, [chipKeys]);

  // Animated pieces run only on shelves you can see, and never under the try-on (a Modal
  // never blurs the screen). One bitmask, recomputed on the UI thread, crosses to JS only
  // when a shelf comes into or leaves view (performance panel round 1).
  const [visibleMask, setVisibleMask] = useState(-1);
  // The scroll view's own height (measured), not the window's.
  const viewH = useSharedValue(Dimensions.get('window').height);
  useAnimatedReaction(() => {
    const list = tops.value;
    let mask = 0;
    for (let i = 0; i < list.length; i++) {
      const top = list[i];
      const bottom = i + 1 < list.length ? list[i + 1] : Number.POSITIVE_INFINITY;
      if (top < shelfY.value + viewH.value && bottom > shelfY.value) mask |= 1 << i;
    }
    return list.length ? mask : -1;
  }, (mask, prev) => { if (mask !== prev) runOnJS(setVisibleMask)(mask); });
  // Idle step-down: 20 s with no touch or scroll and the shelf tiles rest (the Vault hero keeps
  // playing); the next touch wakes them, and each plays its moment again (performance round 2).
  const [idle, setIdle] = useState(false);
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wake = useCallback(() => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    setIdle(false);
    idleTimer.current = setTimeout(() => setIdle(true), 20_000);
  }, []);
  useEffect(() => { wake(); return () => { if (idleTimer.current) clearTimeout(idleTimer.current); }; }, [wake]);
  useEffect(() => { if (!open) wake(); }, [open]);
  const pausedFor = (key: string) => {
    if (open) return true;
    if (idle && key !== 'hero') return true;
    const i = chips.findIndex(c => c.key === key);
    return i >= 0 && visibleMask !== -1 && (visibleMask & (1 << i)) === 0;
  };
  const jump = useCallback((i: number) => {
    const key = chips[i]?.key;
    if (!key) return;
    playSound(require('../../../assets/sounds/tap.mp3'));
    void Haptics.selectionAsync().catch(() => undefined);
    scrollRef.current?.scrollTo({ y: Math.max(0, (topsRef.current[key] ?? 0) + wrapY.current - 8), animated: !still });
  }, [chipKeys, still]);

  return (
    <ShopProfile id="shelves">
      <View style={{ flex: 1 }}>
        {/* The Secret Shop is four short shelves: no unlabeled icon row to decode (kids UX round 1). */}
        {!secret && <JumpBar chips={chips} tops={tops} scrollY={shelfY} maxY={maxY} onJump={jump} />}
        <View style={{ flex: 1 }}>
        <Animated.ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
          onLayout={e => { viewH.value = e.nativeEvent.layout.height; }} onScrollBeginDrag={wake} onTouchStart={wake}
          onScroll={scrollHandler} scrollEventThrottle={16}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={BRAND.white} />}>
          {today.fallback && (
            <View style={styles.fallback}><GameIcon name="timer" size={18} />
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.fallbackText}>{fallbackBannerCopy(pollStopped)}</Text></View>
          )}
          {empty && (
            <View style={[styles.panel, styles.emptyPanel]} accessible accessibilityLabel={`${empty.title}. ${empty.body}`}>
              <GameIcon name="timer" size={34} />
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.emptyTitle}>{empty.title}</Text>
              <Text maxFontSizeMultiplier={MAX_FONT} style={styles.emptyBody}>{empty.body}</Text>
            </View>
          )}
          {secret && !vip && <SecretPreviewBanner />}
          {readySets.length > 0 && (
            <Animated.View entering={enter(0)} exiting={still ? undefined : FadeOutUp.duration(220)}>
              <ReadyCard sets={readySets} todayIds={todayIds} busy={claiming} onClaimAll={() => void claimAll()} />
            </Animated.View>
          )}

          <Animated.View layout={still ? undefined : LinearTransition.duration(220)} style={{ gap: 14 }}
            onLayout={e => { wrapY.current = e.nativeEvent.layout.y; syncTops(); }}>
            {featured && hero && (
              <Animated.View entering={enter(0)} onLayout={measure('hero')}>
                <FxPauseContext.Provider value={pausedFor('hero')}>
                <ShopProfile id="hero">
                  <Hero item={hero} set={heroSet} section={featured} offset={offset} still={still} todayItems={allItems}
                    tease={heroTease} onOpen={openItem} secret={secret} />
                </ShopProfile>
                </FxPauseContext.Provider>
              </Animated.View>
            )}

            {events.map((section, index) => (
              <Animated.View key={section.key} entering={enter(index + 1)} onLayout={measure(section.key)}>
                <FxPauseContext.Provider value={pausedFor(section.key)}>
                <ShopProfile id={`banner-${section.key}`}>
                  <EventBanner section={section} offset={offset} still={still} vip={vip} balance={balance} bought={bought} flipIn={firstOpenToday}
                    todayIds={todayIds} setsBySlug={setsBySlug} onOpen={openItem} onWish={wish} onTrySet={trySet} secret={secret} />
                </ShopProfile>
                </FxPauseContext.Provider>
              </Animated.View>
            ))}

            {featured && (
              <Animated.View entering={enter(events.length + 1)} style={[styles.panel, secret && secretPanel]} onLayout={measure('featured')}>
                <View style={styles.header}>
                  <Text maxFontSizeMultiplier={MAX_FONT} style={styles.headerTitle}>{secret ? 'MORE IN THE VAULT' : 'FEATURED'}</Text>
                  <SectionPills section={featured} offset={offset} still={still} />
                </View>
                {featured.set_slugs.map(slug => setsBySlug.get(slug)).filter((s): s is ShopSetSummary => !!s).map(set => (
                  <SetCallout key={set.slug} set={set} todayIds={todayIds} onTry={trySet} />
                ))}
                <FxPauseContext.Provider value={pausedFor('featured')}>
                <Grid items={featuredRest} vip={vip} balance={balance} still={still} bought={bought} flipIn={firstOpenToday} onOpen={openTile} onWish={wish}
                  width={secret ? SECRET_TILE_W : TILE_W} centered={secret} />
                </FxPauseContext.Provider>
              </Animated.View>
            )}

            {daily && (
              <Animated.View entering={enter(events.length + 2)} style={[styles.panel, secret && secretPanel]} onLayout={measure('daily')}>
                <View style={[styles.header, { overflow: 'hidden', borderTopLeftRadius: 19, borderTopRightRadius: 19 }]}>
                  {firstOpenToday && <Sheen still={still} delay={700} width={SCREEN_W} />}
                  <View style={{ flexShrink: 1, gap: 4 }}>
                    <Text maxFontSizeMultiplier={MAX_FONT} style={styles.headerTitle}>{secret ? "TONIGHT'S PICK" : 'DAILY'}</Text>
                    {dailyNew && <View style={styles.newChip}><Text maxFontSizeMultiplier={MAX_FONT} style={styles.newChipText}>{dailyNew}</Text></View>}
                  </View>
                  <SectionPills section={daily} offset={offset} still={still} />
                </View>
                <FxPauseContext.Provider value={pausedFor('daily')}>
                <Grid items={daily.items} vip={vip} balance={balance} still={still} bought={bought} flipIn={firstOpenToday} onOpen={openTile} onWish={wish}
                  width={secret ? SECRET_TILE_W : TILE_W} centered={secret} />
                </FxPauseContext.Provider>
              </Animated.View>
            )}
          </Animated.View>
        </Animated.ScrollView>
        {/* Content fades under the tab row instead of a hard cut. */}
        <LinearGradient pointerEvents="none" colors={secret ? [SECRET_THEME.floor, 'rgba(22,15,61,0)'] : [BRAND.blue, 'rgba(7,104,185,0)']} style={styles.fade} />
        </View>
        <ShopToast message={toast} still={still} />
        {handoff && <View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: REVEAL_NAVY }]} />}
      </View>

      {open && (
        <TryOnSheet item={open.item} set={openSet} todayIds={todayIds} still={still} accent={open.accent}
          startFullLook={open.fullLook} startBought={open.bought}
          onClose={closeTryOn} onLeaving={leavingTryOn} onWish={wish} onPurchased={onPurchased} onWorn={onWorn}
          checkOwned={checkOwned} buyPaused={!!today.fallback} rewardPending={rewardPendingFor(reveals, open.item.shop?.set?.slug)} secret={secret} />
      )}
      {reveal && !open && revealGate && <SetCompleteReveal key={reveal.reward.slug} reward={reveal.reward} set={reveal.set} still={still}
        bridged={handoff} onDone={finishReveal} onShown={revealShown} />}
      {secret && <GrownUpGateHost />}
      {askAlerts && (
        <GameDialog visible title="Want a heads-up?" icon="bell"
          message="We'll send one note the next time something on your wishlist is in the shop. Turn it off anytime in Settings."
          buttons={[{ text: 'Yes, tell me', onPress: () => void answerAlerts(true) }, { text: 'No thanks', style: 'cancel', onPress: () => void answerAlerts(false) }]}
          onAnswer={() => setAskAlerts(false)} />
      )}
    </ShopProfile>
  );
}

const S = SHOP_SURFACE;
const secretPanel = { backgroundColor: SECRET_THEME.panel, borderColor: SECRET_THEME.border };
const MOON_BATS = require('../../../assets/fx/moonbats.webp');
const styles = StyleSheet.create({
  scroll: { paddingTop: 14, paddingBottom: 40, gap: 14 },
  fade: { position: 'absolute', top: 0, left: 0, right: 0, height: 24 },
  fallback: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 12, padding: 10, borderRadius: 14, backgroundColor: 'rgba(5,52,110,0.6)' },
  fallbackText: { flex: 1, fontFamily: FONT.display, fontSize: 15, color: BRAND.white },
  // Shelf panels in the house blue with white ink (never a white panel).
  panel: { marginHorizontal: 10, borderRadius: 22, backgroundColor: S.panel, paddingBottom: 14,
    borderWidth: 3, borderColor: S.border, ...SHADOW.card },
  emptyPanel: { alignItems: 'center', gap: 6, paddingVertical: 28, paddingHorizontal: 20 },
  emptyTitle: { fontFamily: FONT.display, fontSize: 22, color: S.ink, textAlign: 'center' },
  emptyBody: { fontFamily: FONT.body, fontSize: 17, color: S.inkSoft, textAlign: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8,
    paddingHorizontal: 14, paddingTop: 12, paddingBottom: 6 },
  headerTitle: { fontFamily: FONT.display, fontSize: 22, color: S.ink, letterSpacing: 0.5 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  moonBats: { position: 'absolute', top: 10, right: 12, width: 96, height: 91 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, paddingHorizontal: GRID_PAD, paddingTop: 14 },
  event: { marginHorizontal: 10, borderRadius: 22, paddingBottom: 14, borderWidth: 3, borderColor: BRAND.white, overflow: 'hidden', ...SHADOW.card },
  eventArt: { position: 'absolute', top: 0, left: 0, right: 0, height: Math.round((SCREEN_W - 20) * 0.4) },
  eventShine: { position: 'absolute', top: -60, right: -40, width: 200, height: 200, borderRadius: 100, backgroundColor: 'rgba(255,255,255,0.16)' },
  eventHead: { paddingHorizontal: 14, paddingTop: 14, minHeight: Math.round((SCREEN_W - 20) * 0.4) - 18 },
  eventKicker: { fontFamily: FONT.display, fontSize: 13, letterSpacing: 1.2, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  eventTitle: { fontFamily: FONT.display, fontSize: 28, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 4, textShadowOffset: { width: 0, height: 2 } },
  eventSub: { maxWidth: '64%', fontFamily: FONT.body, fontSize: 17, textShadowColor: 'rgba(0,0,0,0.35)', textShadowRadius: 3, textShadowOffset: { width: 0, height: 1 } },
  eventRow: { gap: GAP, paddingHorizontal: 14, paddingTop: 16, paddingBottom: 6 },
  tease: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: 12, paddingLeft: 8, paddingRight: 6, paddingVertical: 4, borderWidth: 2, borderColor: BRAND.white },
  teaseLabel: { fontFamily: FONT.display, fontSize: 12, color: BRAND.goldLip, letterSpacing: 0.8 },
  teaseName: { maxWidth: 130, fontFamily: FONT.display, fontSize: 14, color: BRAND.navy },
  teaseShapes: { flexDirection: 'row', gap: 2 },
  teaseShape: { width: 24, height: 24, opacity: 0.85 },
  teaseQ: { width: 24, textAlign: 'center', fontFamily: FONT.display, fontSize: 18, color: BRAND.navy },
  hero: { marginHorizontal: 10, borderRadius: 24, borderWidth: 4, overflow: 'hidden', backgroundColor: S.panel, ...SHADOW.card },
  jumpBar: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 10, height: JUMP_H, paddingHorizontal: 12, backgroundColor: BRAND.blue },
  jumpSlot: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center' },
  jumpChip: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: S.well,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.7)' },
  // Same box as every chip; the active one scales (no layout change, the row never shifts).
  jumpChipOn: { borderWidth: 3, borderColor: BRAND.gold, transform: [{ scale: 1.14 }] },
  heroStage: { position: 'absolute', left: HERO_L.stage.left, top: HERO_L.stage.top, height: HERO_L.stage.height, width: HERO_L.stage.width },
  heroKickerRow: { position: 'absolute', left: 0, right: 0, top: 0, height: HERO.kickerH, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: HERO.rowGap, paddingHorizontal: HERO.pad, paddingTop: 4 },
  heroFlat: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  heroText: { position: 'absolute', left: HERO.pad, top: HERO.kickerH + 4, height: HERO_L.textH, width: HERO_L.textW, gap: HERO.gap },
  heroKicker: { flexShrink: 1, fontFamily: FONT.display, fontSize: HERO.kickerFont, color: S.inkGold, letterSpacing: HERO.kickerTracking },
  heroName: { fontFamily: FONT.display, fontSize: HERO_L.nameSize, lineHeight: HERO_L.nameLine, color: S.ink },
  heroRarityDot: { marginLeft: 4, width: 14, height: 14, borderRadius: 7, borderWidth: 2, borderColor: BRAND.white },
  heroRarity: { marginLeft: 4, borderRadius: 7, paddingHorizontal: 7, paddingVertical: 2 },
  heroRarityText: { fontFamily: FONT.display, fontSize: 12, color: BRAND.white, letterSpacing: 0.5 },
  heroSet: { fontFamily: FONT.display, fontSize: 14, lineHeight: HERO.setLine, color: S.inkSoft },
  heroPieces: { flexDirection: 'row', gap: 6, marginTop: HERO.piecesTop },
  heroMore: { width: 36, height: 36, borderRadius: 12, backgroundColor: S.card, borderWidth: 2, borderColor: S.border, alignItems: 'center', justifyContent: 'center' },
  heroMoreText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.white },
  heroPrice: { flexDirection: 'row', alignItems: 'center', gap: 4, height: HERO.priceRow },
  heroMoves: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 9, paddingVertical: 4,
    borderRadius: 999, backgroundColor: SECRET_THEME.well, borderWidth: 2, borderColor: SECRET_THEME.violet },
  heroMovesText: { fontFamily: FONT.display, fontSize: 13, color: SECRET_THEME.inkGold },
  heroPriceText: { fontFamily: FONT.display, fontSize: 18, color: S.ink },
  heroCta: { alignSelf: 'flex-start', minHeight: HERO.cta, justifyContent: 'center', backgroundColor: BRAND.gold, borderRadius: 999, paddingHorizontal: 16,
    borderBottomWidth: 4, borderBottomColor: BRAND.goldLip },
  heroCtaText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.navy },
  heroGhost: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 18, borderWidth: 3, borderColor: S.ink },
  heroGhostText: { fontFamily: FONT.display, fontSize: 16, color: S.ink },
  wearingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', backgroundColor: BRAND.green,
    borderRadius: 999, paddingLeft: 6, paddingRight: 14, paddingVertical: 5, borderWidth: 2, borderColor: BRAND.white },
  wearingText: { fontFamily: FONT.display, fontSize: 15, color: BRAND.white },
  heroTease: { position: 'absolute', left: 10, right: 10, bottom: 6 },
  setCard: { marginHorizontal: 12, marginTop: 12, borderRadius: 16, borderWidth: 3, backgroundColor: S.card, padding: 10, gap: 8 },
  readyCard: { borderColor: BRAND.gold, backgroundColor: S.panel },
  readyTitle: { flex: 1, fontFamily: FONT.display, fontSize: 19, color: S.ink },
  readySet: { gap: 6, paddingVertical: 4, borderTopWidth: 1, borderTopColor: S.line },
  readyRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  readyMore: { fontFamily: FONT.display, fontSize: 14, color: S.inkSoft },
  newChip: { alignSelf: 'flex-start', backgroundColor: BRAND.gold, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  newChipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.navy },
  readySetName: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navySoft },
  setHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setTitle: { flex: 1, fontFamily: FONT.display, fontSize: 17, color: S.ink },
  setCount: { fontFamily: FONT.display, fontSize: 15, color: S.inkGold },
  segments: { flexDirection: 'row', gap: 4 },
  segment: { flex: 1, height: 8, borderRadius: 4, backgroundColor: S.line },
  setRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  portrait: { width: 78, height: 88, borderRadius: 14, borderWidth: 3, overflow: 'hidden', backgroundColor: '#dff3ff' },
  setPieces: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  titleChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  titleChipText: { fontFamily: FONT.display, fontSize: 13, color: BRAND.goldLight },
  xpChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.navy, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  xpChipText: { fontFamily: FONT.display, fontSize: 13, color: S.inkSoft },
  doneChip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: BRAND.greenLip, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  doneText: { fontFamily: FONT.display, fontSize: 13, color: S.ink },
});
