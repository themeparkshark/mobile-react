/**
 * Collections: every collection set and the finds in it.
 *
 * One hierarchy, top to bottom (Oct 8 rethink, see SetCollection/BookParts.tsx): the shelf of sets with
 * their counts, then on a cream sheet the open set (name, "9 of 40 found", the next goal in words, when its
 * finds are on the map, the Hunt this set switch), its prizes as labeled rows, and its finds grouped by
 * rarity under named headings. Each fact appears once. Tap a find for the big item card.
 *
 * Data: legacy /me/prep-item-sets endpoints, overlaid with the optional Home
 * Hunt v3 dex endpoints (see dexModel.ts). Works against either server.
 * Refresh: on focus, every minute while the open set is timed, otherwise
 * every 5 minutes; unchanged data never re-renders the tiles.
 */
import { useFocusEffect, useIsFocused, useRoute } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Animated, { cancelAnimation, FadeInDown, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { GiftReceipt } from '../api/endpoints/me/prep-variant-gifts';
import getPrepItemSets, {
  claimSetMilestone, claimSetRewards, claimStarterRewards, clearPrepItemSetFocus, equipSetTitle,
  focusPrepItemSet, getPrepItemSet, type PrepItemSetDetailResponse, type PrepItemSetItem, type PrepItemSetListItem,
} from '../api/endpoints/me/prep-item-sets';
import { getHomeHuntDex, getHomeHuntDexSet } from '../api/endpoints/me/homeHuntDex';
import equipInventoryItem from '../api/endpoints/me/inventory/update-inventory';
import { invalidateMenuRewardBadge } from '../components/QuickAccessMenu';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper, { BOTTOM_BAR_OVERHANG } from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import { playSfx } from '../gamekit/SFX';
import * as Haptics from '../helpers/haptics';
import type { ItemType } from '../models/item-type';
import * as RootNavigation from '../RootNavigation';
import { BRAND, GameButton, GameIcon, SHADOW } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { showToast } from '../utils/toast';
import GiftPrepVariantPanel from './GiftPrepVariantPanel';
import { itemArt, setBadge } from './SetCollection/DexParts';
import {
  BOOK_BG, BookHeader, FindsHeader, PrizeRows, RareBanner, RarityHeading, SHEET, SHELF_CARD_H, SHELF_CARD_W, SHELF_GAP, ShelfCard, ShelfEventCard,
} from './SetCollection/BookParts';
import { ItemCard } from './SetCollection/DexItemCard';
import { RewardReveal } from './SetCollection/DexReveal';
import { cachedBook, storeBook, storeDetail } from './SetCollection/dexCache';
import { getEventShelf, type EventCard, type EventShelf } from './SetCollection/eventCards';
import { ItemTile, tileHeight } from './SetCollection/DexTile';
import { useBookClocks } from './SetCollection/bookClock';
import { TilePanel } from './SetCollection/dexLook';
import {
  buildBook, buildItems, findRows, initialSlug, mergeStable, refreshEveryMs,
  type DexBook, type DexItem, type DexReward, type DexSet, type FindRow,
} from './SetCollection/dexModel';
import { ClaimResultCard, MilestonePickSheet } from './SetCollection/SetHuntSections';
import { claimOutcome, wearNavigationParams, type ClaimOutcome, type MilestoneView } from './SetCollection/setHuntModel';

type Detail = PrepItemSetDetailResponse['data'];

const COLUMNS = 4;
const CELL_GAP = 10;
const SIDE = 16;
/** Space under the last row and any button: the bar plus the compass overhang plus breathing room. */
const CTA_CLEARANCE = BOTTOM_BAR_OVERHANG + 84;

/** A pick sheet view for any reward that needs a wearable choice. */
function pickView(reward: DexReward, found: number): MilestoneView {
  return {
    key: (reward.claim.kind === 'milestone' ? reward.claim.key : 'starter') as MilestoneView['key'],
    label: reward.label, target: reward.target, collected: found, progress: 1, monthGoal: false,
    status: reward.status === 'claimable' ? 'claimable' : 'locked', canClaim: reward.status === 'claimable',
    needsPick: reward.needsPick, pending: reward.status === 'pending', choices: reward.choices, rewardLine: reward.prize,
  };
}

export default function SetCollectionScreen({ previewSets, previewDetails, previewDex, previewDexDetails }: {
  previewSets?: PrepItemSetListItem[];
  previewDetails?: Record<string, Detail>;
  previewDex?: unknown;
  previewDexDetails?: Record<string, unknown>;
} = {}) {
  const route = useRoute();
  const linkedSlug = (route.params as { slug?: string } | undefined)?.slug ?? null;
  const isFocused = useIsFocused();
  const reduced = useUiReducedMotion();
  const { width } = useWindowDimensions();
  const { player, refreshPlayer } = useContext(AuthContext);
  const { location } = useContext(LocationContext);
  const locationRef = useRef(location);
  locationRef.current = location;
  const preview = previewSets != null;

  // Opens instantly from the session copy the menu prefetched; the reads below refresh it in place.
  const seed = previewSets ? null : cachedBook(player?.id);
  const seedSlug = seed ? initialSlug(seed.book.sets, linkedSlug) : null;
  const seedDetail = seed && seedSlug ? seed.details[seedSlug] : undefined;
  const [book, setBook] = useState<DexBook>(() => seed?.book ?? { sets: [], found: 0, total: 0, dailyRare: null });
  const sets = book.sets;
  const bookKey = useRef('');
  const [loading, setLoading] = useState(!seed);
  const [listError, setListError] = useState(false);
  const [slug, setSlug] = useState<string | null>(seedSlug ?? linkedSlug);
  const [detail, setDetail] = useState<{ slug: string; raw: Detail; items: DexItem[]; spares: number } | null>(() => {
    if (!seedSlug || !seedDetail) return null;
    const page = seedDetail.dex as { items?: unknown; exchange?: { spares?: unknown } } | null;
    const spares = typeof page?.exchange?.spares === 'number' ? page.exchange.spares : Math.max(0, seedDetail.raw.progress.spare_count ?? 0);
    return { slug: seedSlug, raw: seedDetail.raw, items: buildItems(seedDetail.raw, page?.items), spares };
  });
  const [detailError, setDetailError] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DexItem | null>(null);
  const [giftItem, setGiftItem] = useState<DexItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<DexReward | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimOutcome | null>(null);
  const [wearing, setWearing] = useState(false);
  const [sparesOpen, setSparesOpen] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const [reveal, setReveal] = useState<{ set: DexSet; reward: DexReward; key: number } | null>(null);
  const [stamp, setStamp] = useState<{ slug: string; title: string } | null>(null);
  const claimDim = useSharedValue(0);
  // While the claim is in flight the whole window dims (top bar and tab bar too) and the wait builds up.
  const [claimWaiting, setClaimWaiting] = useState(false);
  const claimDimStyle = useAnimatedStyle(() => ({ opacity: claimDim.value }));
  const buildUp = (
    <>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#031C3F' }, claimDimStyle]} />
      <ClaimBuildUp reduced={reduced} />
    </>
  );
  const pickerRef = useRef<ScrollView>(null);

  // Events (the fright mode and later ones): only when the player earned something and the card screen exists in this build.
  const [events, setEvents] = useState<EventShelf>({ cards: [], lifetimeHaunts: 0 });
  useEffect(() => {
    if (preview) return;
    let live = true;
    void getEventShelf().then(shelf => { if (live) setEvents(shelf); });
    return () => { live = false; };
  }, [preview]);
  const openEvent = useCallback((card: EventCard) => {
    playSfx('fx.whoosh', 0.4);
    RootNavigation.navigate('FrightCard', { eventSlug: card.eventSlug });
  }, []);
  const eventsReady = events.cards.length > 0 && eventRouteExists();

  // The legacy payloads carry claim routes and wearable picks; they change only on actions. A timer
  // tick with v3 live re-reads just the v3 dex (2 requests per tick, not 4) over the last legacy copy.
  const legacyList = useRef<PrepItemSetListItem[] | null>(seed?.legacy ?? null);
  const legacyDetail = useRef<Record<string, Detail>>(
    Object.fromEntries(Object.entries(seed?.details ?? {}).map(([key, entry]) => [key, entry.raw])));

  const loadSets = useCallback(async (light = false): Promise<DexSet[]> => {
    try {
      // A light tick with a legacy copy in hand reads only the v3 dex; otherwise both reads run together.
      let dex: unknown;
      let legacy: PrepItemSetListItem[];
      if (previewSets) {
        dex = previewDex ?? null;
        legacy = previewSets;
      } else if (light && legacyList.current != null) {
        dex = await getHomeHuntDex(locationRef.current);
        const reuse = dex != null;
        legacy = reuse ? legacyList.current : await getPrepItemSets(locationRef.current ?? undefined);
      } else {
        [dex, legacy] = await Promise.all([getHomeHuntDex(locationRef.current), getPrepItemSets(locationRef.current ?? undefined)]);
      }
      legacyList.current = legacy;
      const next = buildBook(legacy, dex);
      if (!previewSets && player?.id != null) storeBook(player.id, legacy, dex, next);
      // Same data, same render: skip the state update entirely.
      const key = JSON.stringify(next);
      if (key !== bookKey.current) {
        bookKey.current = key;
        setBook(next);
      }
      setListError(false);
      setSlug(current => (current && next.sets.some(set => set.slug === current) ? current : initialSlug(next.sets, linkedSlug)));
      return next.sets as DexSet[];
    } catch {
      setListError(true);
      return [];
    } finally {
      setLoading(false);
    }
  }, [previewSets, previewDex, linkedSlug]);

  const loadDetail = useCallback(async (target: string, light = false) => {
    try {
      let dex: unknown;
      let raw: Detail;
      if (preview) {
        dex = previewDexDetails?.[target] ?? null;
        raw = previewDetails?.[target] ?? await getPrepItemSet(target, locationRef.current ?? undefined);
      } else if (light && legacyDetail.current[target]) {
        dex = await getHomeHuntDexSet(target, locationRef.current);
        raw = dex != null ? legacyDetail.current[target] : await getPrepItemSet(target, locationRef.current ?? undefined);
      } else {
        // Both reads together (a park network pays one wait, not two).
        [dex, raw] = await Promise.all([getHomeHuntDexSet(target, locationRef.current), getPrepItemSet(target, locationRef.current ?? undefined)]);
      }
      legacyDetail.current[target] = raw;
      if (!preview && player?.id != null) storeDetail(player.id, target, raw, dex);
      const payload = dex as { items?: unknown; exchange?: { spares?: unknown } } | null;
      const fresh = buildItems(raw, payload?.items);
      const spares = typeof payload?.exchange?.spares === 'number' ? payload.exchange.spares : Math.max(0, raw.progress.spare_count ?? 0);
      setDetail(current => {
        const items = mergeStable(current?.slug === target ? current.items : null, fresh);
        const same = current?.slug === target && current.spares === spares && items.length === current.items.length
          && items.every((item, index) => item === current.items[index]);
        return same ? current : { slug: target, raw, items, spares };
      });
      setDetailError(false);
    } catch {
      setDetailError(true);
    }
  }, [previewDetails, previewDexDetails, preview]);

  useEffect(() => { void loadSets(); }, [loadSets]);
  // A set switch paints the last copy of that set at once (session cache or preview), then refreshes in place.
  useEffect(() => {
    if (!slug) return;
    setDetail(current => {
      if (current?.slug === slug) return current;
      const cachedRaw = previewDetails?.[slug] ?? legacyDetail.current[slug];
      if (!cachedRaw) return current;
      const cachedDex = (preview ? previewDexDetails?.[slug] : cachedBook(player?.id)?.details[slug]?.dex) as
        { items?: unknown; exchange?: { spares?: unknown } } | null | undefined;
      const spares = typeof cachedDex?.exchange?.spares === 'number' ? cachedDex.exchange.spares : Math.max(0, cachedRaw.progress.spare_count ?? 0);
      return { slug, raw: cachedRaw, items: buildItems(cachedRaw, cachedDex?.items), spares };
    });
    void loadDetail(slug);
  }, [slug, loadDetail, preview, previewDetails, previewDexDetails, player?.id]);

  const set = useMemo(() => sets.find(entry => entry.slug === slug) ?? null, [sets, slug]);
  const items = detail && detail.slug === slug ? detail.items : null;
  const spares = detail && detail.slug === slug ? detail.spares : set?.spares ?? 0;

  // Back on screen: refresh once (skips the very first focus, which the mount load covers).
  // While open: fast only for a timed set, else every 5 minutes.
  const slugRef = useRef(slug);
  slugRef.current = slug;
  const focusedOnce = useRef(false);
  useFocusEffect(useCallback(() => {
    if (preview) return undefined;
    if (!focusedOnce.current) { focusedOnce.current = true; return undefined; }
    void loadSets();
    if (slugRef.current) void loadDetail(slugRef.current);
    return undefined;
  }, [preview, loadSets, loadDetail]));
  const every = refreshEveryMs(set);
  useEffect(() => {
    if (!isFocused || preview) return;
    const timer = setInterval(() => {
      void loadSets(true);
      if (slug) void loadDetail(slug, true);
    }, every);
    return () => clearInterval(timer);
  }, [isFocused, preview, loadSets, loadDetail, slug, every]);

  // Keep the picked set card on screen, centered when possible: on change, and once the picker has laid out.
  const slugIndex = sets.findIndex(entry => entry.slug === slug);
  const centerPicker = useCallback((animated: boolean) => {
    if (slugIndex < 0) return;
    // Land on a whole-card stop (the snap grid) with the card before it in view, never a card cut mid-word on the left.
    const step = SHELF_CARD_W + 6 + SHELF_GAP;
    pickerRef.current?.scrollTo({ x: Math.max(0, slugIndex - 1) * step, animated });
  }, [slugIndex, width]);
  useEffect(() => { centerPicker(!reduced); }, [centerPicker, reduced]);

  const reloadAll = useCallback(async () => {
    const list = await loadSets();
    if (slug) await loadDetail(slug);
    return list;
  }, [loadSets, loadDetail, slug]);

  const chooseSet = useCallback((next: string) => {
    setSlug(current => {
      if (current === next) return current;
      playSfx('ui.select', 0.5);
      void Haptics.selectionAsync().catch(() => undefined);
      setError(null);
      setClaimResult(null);
      return next;
    });
  }, []);

  const celebrate = useCallback((reward: DexReward) => {
    playSfx('fx.reward', 0.9);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    invalidateMenuRewardBadge();
    // The reveal is opaque and up: the pre-dim and the busy CLAIM go at once (never wait on the refresh calls).
    claimDim.value = withTiming(0, { duration: 200 });
    setBusy(null);
    setClaimWaiting(false);
    if (set) setReveal({ set, reward, key: Date.now() });
  }, [set, claimDim]);

  const claim = useCallback(async (reward: DexReward, itemId?: number) => {
    if (!set || busy) return;
    if (reward.needsPick && itemId == null) {
      playSfx('ui.tap', 0.6);
      setPicking(reward);
      return;
    }
    setBusy(reward.id);
    setError(null);
    // Answer the tap at once (whoosh, haptic, the dim toward the reveal) so the server wait hides in the build-up.
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    playSfx('fx.whooshRev', 0.7);
    setClaimWaiting(true);
    claimDim.value = reduced ? 0.6 : withTiming(0.6, { duration: 450 });
    try {
      if (preview) {
        // Nothing to send: the local mark below is the whole claim.
      } else if (reward.claim.kind === 'complete') {
        // On an authored set the server pays the full-set claim as its Master milestone, wearable included,
        // so the same "Added to your Inventory / WEAR IT" outcome applies (a legacy set grants no item: no card).
        const outcome = claimOutcome(await claimSetRewards(set.slug));
        setClaimResult(outcome);
        if (outcome.toast) showToast(outcome.toast, 'success');
      } else if (reward.claim.kind === 'starter') {
        await claimStarterRewards(set.slug, itemId);
      } else {
        const result = await claimSetMilestone(set.slug, reward.claim.key, itemId);
        const outcome = claimOutcome(result);
        setClaimResult(outcome);
        if (outcome.toast) showToast(outcome.toast, 'success');
      }
      // Mark it claimed now: the book behind the reveal never offers CLAIM again while the refresh is in flight.
      setBook(current => ({ ...current, sets: current.sets.map(entry => entry.slug !== set.slug ? entry : {
        ...entry,
        reward: entry.reward.id === reward.id ? { ...entry.reward, status: 'claimed' } : entry.reward,
        steps: entry.steps.map(step => step.id === reward.id ? { ...step, status: 'claimed' } : step),
      }) }));
      setPicking(null);
      celebrate(reward);
      // Background: a slow park network never holds the reveal, the dim or the button.
      if (!preview) void refreshPlayer().catch(() => undefined).then(() => reloadAll()).catch(() => undefined);
    } catch {
      // A lost response can follow a saved claim. Read it back before blaming the player.
      const list = await reloadAll();
      const fresh = list.find(entry => entry.slug === set.slug);
      const after = fresh ? [fresh.reward, ...fresh.steps].find(entry => entry.id === reward.id) : null;
      if (after && (after.status === 'claimed' || after.status === 'pending')) {
        setPicking(null);
        celebrate(reward);
        void refreshPlayer().catch(() => undefined);
      } else {
        setError('Your prize didn’t come through. Tap Claim again.');
        playSfx('fx.nopeShort', 0.6);
      }
    } finally {
      // Error path (success already cleared these in celebrate).
      setBusy(null);
      setClaimWaiting(false);
      claimDim.value = reduced ? 0 : withTiming(0, { duration: 200 });
    }
  }, [set, busy, preview, refreshPlayer, reloadAll, celebrate, claimDim, reduced]);

  const wearIt = useCallback(async () => {
    const wear = claimResult?.wear;
    if (!wear || wearing) return;
    setWearing(true);
    try {
      await equipInventoryItem({ id: wear.itemId } as ItemType);
      await refreshPlayer().catch(() => undefined);
    } catch {
      showToast('Could not put it on. Open your closet to wear it.', 'warning');
    } finally {
      setWearing(false);
    }
    RootNavigation.navigate('Inventory', wearNavigationParams(wear));
  }, [claimResult, wearing, refreshPlayer]);

  // The preview has no player: it wears titles locally so captures show the real button states.
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const wornTitle = preview ? previewTitle : player?.title ?? null;
  const toggleTitle = useCallback(async () => {
    if (!set?.reward.title || busy) return;
    if (preview) {
      setPreviewTitle(current => (current === set.reward.title ? null : set.reward.title));
      playSfx('ui.confirm', 0.7);
      return;
    }
    setBusy('title');
    try {
      await equipSetTitle(set.slug, player?.title !== set.reward.title, set.reward.titleTier);
      await refreshPlayer();
      playSfx('ui.confirm', 0.7);
    } catch {
      setError('Could not change your title. Try again.');
    } finally {
      setBusy(null);
    }
  }, [set, busy, preview, player?.title, refreshPlayer]);

  const toggleFocus = useCallback(async () => {
    if (!set || busy) return;
    const desired = !set.focused;
    setBusy('focus');
    // Answer the tap at once: the switch flips, a tick, a haptic. The server catches up (rolled back on failure).
    playSfx('ui.select', 0.6);
    void Haptics.selectionAsync().catch(() => undefined);
    setBook(current => ({ ...current, sets: current.sets.map(entry => ({ ...entry, focused: desired && entry.slug === set.slug })) }));
    if (desired) showToast(`${set.name} finds will show up more on your map.`, 'success');
    try {
      if (!preview) {
        if (desired) await focusPrepItemSet(set.slug);
        else await clearPrepItemSetFocus();
        await loadSets();
      }
    } catch {
      const list = await loadSets();
      if (list.find(entry => entry.slug === set.slug)?.focused !== desired) setError('Could not change your hunt. Try again.');
    } finally {
      setBusy(null);
    }
  }, [set, busy, preview, loadSets]);

  const openItem = useCallback((item: DexItem) => {
    // Layered: a tap, then a pluck pitched by rarity for a find you own.
    playSfx('ui.tap', 0.55);
    if (item.found) playSfx(item.rarity >= 4 ? 'fx.reveal' : 'fx.hit', item.rarity >= 4 ? 0.55 : 0.25 + item.rarity * 0.08);
    void Haptics.impactAsync(item.found ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    setError(null);
    setSelectedItem(item);
  }, []);

  const closeItem = useCallback(() => {
    playSfx('ui.modalClose', 0.4);
    setSelectedItem(null);
    setError(null);
  }, []);

  const giftSent = useCallback((receipt: GiftReceipt) => {
    showToast(`You shared a spare with ${receipt.recipient_name}!`, 'success');
    playSfx('fx.reward', 0.7);
    void reloadAll();
  }, [reloadAll]);

  const goToMap = useCallback(() => {
    setSelectedItem(null);
    playSfx('fx.whoosh', 0.4);
    RootNavigation.navigate('Explore');
  }, []);

  const listRef = useRef<FlashList<FindRow | number>>(null);
  // Idle loops run only while the page itself is what the player sees (not under a sheet, card or reveal).
  const active = isFocused && !selectedItem && !reveal && !sparesOpen && !giftItem && !claimWaiting && !picking;
  useBookClocks(active, reduced);
  // Scrolled into the finds: a slim bar keeps the set's badge, name and count in view (state flips only at the line).
  const shelfH = useRef(0);
  const stickAt = useRef(Number.POSITIVE_INFINITY);
  const [stuck, setStuck] = useState(false);
  const stuckRef = useRef(false);
  const onListScroll = useCallback((y: number) => {
    // stickAt: the bottom of the set's header card (its name and count have scrolled away).
    const next = y > stickAt.current;
    if (next !== stuckRef.current) { stuckRef.current = next; setStuck(next); }
  }, []);
  const tile = Math.floor((width - SIDE * 2 - CELL_GAP * (COLUMNS - 1)) / COLUMNS);
  // Today's rare is worth a trip until it is caught: not spawned yet (available) or waiting on the map (onMap).
  const daily = !!book.dailyRare && !book.dailyRare.caughtToday && (book.dailyRare.available || book.dailyRare.onMap);
  // Extras: copies past the first, counted from the tiles when they are loaded (one number everywhere).
  const extras = items ? items.reduce((sum, item) => sum + (item.found ? item.spares : 0), 0) : spares;
  const canShare = !(preview && process.env.EXPO_PUBLIC_CREW_GIFT_PREVIEW !== '1');
  const rows = useMemo(() => (items ? findRows(items, COLUMNS) : null), [items]);

  const header = (
    <View>
      <ScrollView ref={pickerRef} horizontal onLayout={event => { shelfH.current = event.nativeEvent.layout.height; }} showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shelf} snapToInterval={SHELF_CARD_W + 6 + SHELF_GAP} decelerationRate="fast"
        onContentSizeChange={() => centerPicker(false)}>
        {sets.map(entry => <ShelfCard key={entry.slug} set={entry} selected={entry.slug === slug} onPress={chooseSet} active={active} />)}
        {eventsReady && events.cards.map(card => <ShelfEventCard key={`event-${card.eventSlug}`} card={card} onPress={openEvent} />)}
      </ScrollView>
      {daily && <RareBanner onPress={goToMap} />}
      <View style={styles.sheetTop}>
        {set && (
          <>
            <View onLayout={event => { stickAt.current = shelfH.current + event.nativeEvent.layout.y + event.nativeEvent.layout.height - 40; }}>
            <BookHeader set={set} stamp={stamp?.slug === set.slug ? stamp.title : null} focusBusy={busy === 'focus'}
              onFocus={!set.isComplete && (set.status === 'active' || set.status === 'resting') ? () => void toggleFocus() : null} />
            </View>
            <PrizeRows set={set} busyId={busy} onClaim={reward => void claim(reward)}
              titleWorn={!!set.reward.title && wornTitle === set.reward.title} titleBusy={busy === 'title'}
              onTitle={set.reward.title ? () => void toggleTitle() : null} popKey={popKey} active={active} />
            {claimResult && (
              <View style={{ marginHorizontal: SIDE, marginBottom: 10 }}>
                <ClaimResultCard outcome={claimResult} wearing={wearing} onWear={() => void wearIt()} onDismiss={() => setClaimResult(null)} />
              </View>
            )}
            {!!error && !selectedItem && <Text style={styles.error}>{error}</Text>}
            <FindsHeader set={set} extras={extras} onExtras={canShare ? () => { playSfx('ui.tap', 0.5); setSparesOpen(true); } : null} />
            {detailError && !items && (
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>Your finds did not load</Text>
                <GameButton label="Try again" icon="retry" onPress={() => slug && void loadDetail(slug)} />
              </View>
            )}
          </>
        )}
      </View>
    </View>
  );

  // Before the finds arrive: three ghost rows in the real grid (never a spinner).
  const data: (FindRow | number)[] = rows ?? (detailError ? [] : [0, 1, 2]);

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Collections</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>

      <View style={styles.page}>
        <Image source={BOOK_BG} style={StyleSheet.absoluteFill} contentFit="cover" priority="high" cachePolicy="memory" transition={0} />
        {/* Cream under the lower half, so a bounce past the last row never shows the water. */}
        <View pointerEvents="none" style={styles.sheetBack} />
        {loading ? (
          <BookSkeleton tile={tile} />
        ) : listError ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitleLight}>Your collection did not load</Text>
            <GameButton label="Try again" icon="retry" onPress={() => { setLoading(true); void loadSets(); }} />
          </View>
        ) : sets.length === 0 ? (
          <View style={styles.center}>
            <GameIcon name="search" size={64} />
            <Text style={styles.emptyTitleLight}>Catch your first find!</Text>
            <GameButton label="Open the map" icon="map" onPress={goToMap} />
          </View>
        ) : (
          <FlashList
            ref={listRef}
            data={data}
            estimatedItemSize={tileHeight(tile) + CELL_GAP}
            getItemType={entry => (typeof entry === 'number' ? 'ghost' : entry.kind)}
            keyExtractor={entry => (typeof entry === 'number' ? `ghost-${entry}` : entry.key)}
            ListHeaderComponent={header}
            onScroll={event => onListScroll(event.nativeEvent.contentOffset.y)}
            scrollEventThrottle={32}
            ListFooterComponent={<View style={{ height: CTA_CLEARANCE, backgroundColor: SHEET }} />}
            extraData={tile}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: entry }) => (
              typeof entry === 'number' ? (
                <View style={styles.tileRow}>
                  {Array.from({ length: COLUMNS }, (_, index) => (
                    <View key={index} style={[styles.ghost, { width: tile, height: tile, marginBottom: tileHeight(tile) - tile }]} />
                  ))}
                </View>
              ) : entry.kind === 'heading' ? (
                <View style={{ backgroundColor: SHEET }}>
                  <RarityHeading rarity={entry.rarity} label={entry.label} found={entry.found} total={entry.total} />
                </View>
              ) : (
                <View style={styles.tileRow}>
                  {entry.items.map(item => <ItemTile key={item.id} item={item} width={tile} onPress={openItem} active={active} />)}
                </View>
              )
            )}
          />
        )}
        {set && stuck && <StickyBar set={set} reduced={reduced} onTop={() => listRef.current?.scrollToOffset({ offset: 0, animated: !reduced })} />}
      </View>

      <ItemCard item={selectedItem} set={set} onClose={closeItem} error={error} onFind={goToMap}
        hunt={set && !set.isComplete && (set.status === 'active' || set.status === 'resting')
          ? { on: set.focused, busy: busy === 'focus', onPress: () => void toggleFocus() } : null}
        onShare={!canShare ? null : () => {
          playSfx('ui.tap', 0.5);
          setGiftItem(selectedItem);
          setSelectedItem(null);
        }} />

      <Modal visible={giftItem != null} transparent animationType="fade" onRequestClose={() => setGiftItem(null)}>
        <View style={styles.sheetOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={() => setGiftItem(null)} />
          <View style={styles.giftCard} accessibilityViewIsModal>
            {giftItem && (
              <GiftPrepVariantPanel item={{ id: giftItem.id, name: giftItem.name } as PrepItemSetItem} imageSource={itemArt(giftItem)}
                onBack={() => { setSelectedItem(giftItem); setGiftItem(null); }} onClose={() => setGiftItem(null)}
                onSent={giftSent} onFindFriends={() => { setGiftItem(null); RootNavigation.navigate('Friends'); }} />
            )}
          </View>
        </View>
      </Modal>

      <SparesSheet visible={sparesOpen} items={items ?? []} onClose={() => setSparesOpen(false)}
        onShare={!canShare ? null : item => {
          playSfx('ui.tap', 0.5);
          setSparesOpen(false);
          setGiftItem(item);
        }} />
      {/* The build-up rides in its own window, or inside the wearable sheet when the claim came from there
          (iOS shows one modal at a time, so a second window would never cover the sheet). */}
      <Modal visible={claimWaiting && !picking} transparent animationType="none" statusBarTranslucent>
        {buildUp}
      </Modal>
      <RewardReveal reveal={reveal} onClose={() => {
        const won = reveal;
        setReveal(null);
        // Back in the book: the row stamps its check and pops (the reveal covered it until now).
        setPopKey(key => key + 1);
        // Back in the book: the title stamps onto the set's ribbon (the card ring is already gold).
        if (won?.reward.title) {
          setStamp({ slug: won.set.slug, title: won.reward.title });
          playSfx('ui.confirm', 0.7);
        }
      }} />
      <MilestonePickSheet view={picking && set ? pickView(picking, set.found) : null} busy={busy != null}
        overlay={claimWaiting ? buildUp : null}
        onConfirm={itemId => { if (picking) void claim(picking, itemId); }} onClose={() => setPicking(null)} />
    </Wrapper>
  );
}

/** The slim bar over the finds: badge, name and count. Tap it to go back to the top. */
function StickyBar({ set, reduced, onTop }: { readonly set: DexSet; readonly reduced: boolean; readonly onTop: () => void }) {
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.duration(180)} style={styles.sticky}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${set.name}, ${set.found} of ${set.total} found. Back to the top.`}
        onPress={onTop} style={styles.stickyInner}>
        <View style={[styles.stickyBadge, { borderColor: set.color }]}>
          <Image source={setBadge(set)} style={{ width: 30, height: 30 }} contentFit="contain" />
        </View>
        <Text style={styles.stickyName} numberOfLines={1} maxFontSizeMultiplier={1.2}>{set.name}</Text>
        <Text style={styles.stickyCount} maxFontSizeMultiplier={1.2}>{set.found}/{set.total}</Text>
        <GameIcon name="arrow" size={20} />
      </Pressable>
    </Animated.View>
  );
}

/** The claim wait as a build-up: a pulsing gold glow and, after 600 ms, a rising tone every half second. */
function ClaimBuildUp({ reduced }: { readonly reduced: boolean }) {
  const pulse = useSharedValue(0);
  useEffect(() => {
    if (reduced) return undefined;
    pulse.value = withRepeat(withSequence(withTiming(1, { duration: 380 }), withTiming(0.35, { duration: 380 })), -1, false);
    let step = 0;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const tick = () => {
      playSfx('ui.select', Math.min(0.9, 0.35 + step * 0.12));
      step += 1;
      timers.push(setTimeout(tick, 500));
    };
    timers.push(setTimeout(tick, 600));
    return () => { timers.forEach(clearTimeout); cancelAnimation(pulse); };
  }, [reduced, pulse]);
  const glow = useAnimatedStyle(() => ({ opacity: 0.25 + 0.5 * pulse.value, transform: [{ scale: 0.85 + 0.25 * pulse.value }] }));
  // The gift shakes in step with the rising tones, harder the longer the wait (capped).
  const shake = useSharedValue(0);
  useEffect(() => {
    if (reduced) return undefined;
    shake.value = withRepeat(withSequence(withTiming(1, { duration: 70 }), withTiming(-1, { duration: 140 }), withTiming(0, { duration: 70 }), withTiming(0, { duration: 220 })), -1, false);
    return () => cancelAnimation(shake);
  }, [reduced, shake]);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${shake.value * (6 + 6 * pulse.value)}deg` }, { scale: 1 + 0.06 * pulse.value }] }));
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
      accessible accessibilityLabel="Claiming your reward">
      <Animated.View style={[{ width: 220, height: 220, borderRadius: 110, backgroundColor: BRAND.gold }, glow]} />
      <Animated.View style={[{ position: 'absolute' }, shakeStyle]}><GameIcon name="gift" size={96} /></Animated.View>
    </View>
  );
}

/** The event card screen ships with the fright app; until it is in this build, no Events card shows. */
function eventRouteExists(): boolean {
  try {
    const state = RootNavigation.navigationRef.getRootState();
    return !!state?.routeNames?.includes('FrightCard');
  } catch {
    return false;
  }
}

/** First open with nothing cached: the real layout in placeholder panels (never a blank page or a spinner). */
function BookSkeleton({ tile }: { readonly tile: number }) {
  return (
    <View accessibilityLabel="Loading your collection" accessible style={{ flex: 1 }}>
      <View style={[styles.shelf, { flexDirection: 'row', gap: SHELF_GAP }]}>
        {[0, 1, 2, 3].map(index => <View key={index} style={[styles.skel, { width: SHELF_CARD_W, height: SHELF_CARD_H, borderRadius: 20 }]} />)}
      </View>
      <View style={[styles.sheetTop, { flex: 1, paddingHorizontal: SIDE, paddingTop: 18 }]}>
        <View style={[styles.skelInk, { height: 74, borderRadius: 37, width: 74 }]} />
        <View style={[styles.skelInk, { height: 44, marginTop: 12 }]} />
        <View style={[styles.skelInk, { height: 90, marginTop: 18 }]} />
        <View style={{ flexDirection: 'row', gap: CELL_GAP, marginTop: 18 }}>
          {Array.from({ length: COLUMNS }, (_, index) => <View key={index} style={[styles.skelInk, { width: tile, height: tile, borderRadius: 16 }]} />)}
        </View>
      </View>
    </View>
  );
}

/** Extra copies: every find caught more than once, and what they are for (giving one to a friend). */
function SparesSheet({ visible, items, onClose, onShare }: {
  readonly visible: boolean; readonly items: readonly DexItem[]; readonly onClose: () => void;
  readonly onShare: ((item: DexItem) => void) | null;
}) {
  const list = [...items].filter(item => item.found && item.spares > 0).sort((a, b) => b.spares - a.spares);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sparesCard} accessibilityViewIsModal>
          <Text style={styles.sparesTitle} accessibilityRole="header">Your extras</Text>
          <View style={styles.sparesHint}>
            <GameIcon name="heart" size={24} />
            <Text style={styles.sparesBody}>Tap one to give it to a friend!</Text>
          </View>
          <ScrollView style={{ maxHeight: 300, alignSelf: 'stretch' }} contentContainerStyle={styles.sparesGrid}>
            {list.map(item => (
              <Pressable key={item.id} accessibilityRole="button" disabled={!onShare}
                accessibilityLabel={`${item.name}, ${item.spares} extra. Give one to a friend.`}
                onPress={() => onShare?.(item)} style={({ pressed }) => [styles.spareTile, pressed && { transform: [{ scale: 0.95 }] }]}>
                <TilePanel rarity={item.rarity} found style={styles.spareArtWrap}>
                  <Image source={itemArt(item)} style={styles.sparesArt} contentFit="contain" />
                </TilePanel>
                <View style={styles.sparesTimes}><Text style={styles.sparesTimesText}>+{item.spares}</Text></View>
                <Text style={styles.spareName} numberOfLines={2} maxFontSizeMultiplier={1.2}>{item.name}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.sparesMap}>
            <GameIcon name="map" size={26} />
            <Text style={styles.sparesMapText}>New finds come from the map</Text>
          </View>
          <GameButton label="Done" variant="secondary" onPress={onClose} style={{ marginTop: 12 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // Inside the page, just under the header bar.
  sticky: { position: 'absolute', left: 12, right: 12, top: 16, zIndex: 5 },
  stickyInner: {
    flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 48, paddingHorizontal: 10, borderRadius: 24,
    backgroundColor: BRAND.white, borderWidth: 2, borderColor: '#efe1b8', borderBottomWidth: 4, ...SHADOW.card,
  },
  stickyBadge: { width: 38, height: 38, borderRadius: 19, borderWidth: 3, alignItems: 'center', justifyContent: 'center', backgroundColor: BRAND.white },
  stickyName: { flex: 1, fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  stickyCount: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  // The water art's own average color, so the push never shows a plain blue frame while it decodes.
  page: { flex: 1, marginTop: -8, backgroundColor: '#5cc3f2' },
  sheetBack: { position: 'absolute', left: 0, right: 0, top: '55%', bottom: 0, backgroundColor: SHEET },
  shelf: { paddingHorizontal: SIDE, paddingTop: 16, paddingBottom: 12 },
  // The cream sheet under the shelf: the page for this set (Standings cream, a white rim on top).
  sheetTop: {
    backgroundColor: SHEET, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 3, borderColor: BRAND.white,
    paddingBottom: 4,
  },
  ghost: { borderRadius: 16, borderWidth: 2, borderStyle: 'dashed', borderColor: '#e6d6a6', backgroundColor: '#f6ecd0' },
  tileRow: { flexDirection: 'row', gap: CELL_GAP, paddingHorizontal: SIDE, paddingBottom: CELL_GAP, backgroundColor: SHEET },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 12, width: '100%' },
  emptyTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, textAlign: 'center' },
  emptyTitleLight: {
    fontFamily: 'Shark', fontSize: 22, color: BRAND.white, textAlign: 'center',
    textShadowColor: 'rgba(5,52,110,0.6)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0,
  },
  error: {
    fontFamily: 'Knockout', fontSize: 17, color: BRAND.navy, marginHorizontal: SIDE, marginBottom: 10, padding: 10, borderRadius: 12,
    backgroundColor: BRAND.white, overflow: 'hidden', borderWidth: 2, borderColor: BRAND.red,
  },
  skel: { backgroundColor: 'rgba(255,255,255,0.35)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.45)' },
  skelInk: { borderRadius: 18, backgroundColor: 'rgba(5,52,110,0.07)' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(5,52,110,0.86)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  giftCard: { width: '100%', maxWidth: 400, padding: 16, borderRadius: 24, backgroundColor: '#E9F7FF', borderWidth: 3, borderColor: BRAND.white },
  sparesCard: {
    width: '100%', maxWidth: 380, padding: 18, borderRadius: 24, backgroundColor: SHEET, borderWidth: 4, borderColor: BRAND.white,
    borderBottomWidth: 8, borderBottomColor: '#e3d3a3', alignItems: 'center',
  },
  sparesTitle: { fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, textAlign: 'center' },
  sparesHint: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, marginBottom: 12 },
  sparesBody: { fontFamily: 'Knockout', fontSize: 19, lineHeight: 23, color: BRAND.navy, textAlign: 'center', flexShrink: 1 },
  sparesGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12, paddingVertical: 6 },
  spareTile: { width: 76, alignItems: 'center' },
  spareName: { fontFamily: 'Knockout', fontSize: 14, lineHeight: 16, color: BRAND.navy, textAlign: 'center', marginTop: 8 },
  spareArtWrap: { width: 72, height: 72, justifyContent: 'center' },
  sparesArt: { width: 54, height: 54 },
  sparesMap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
  sparesMapText: { fontFamily: 'Knockout', fontSize: 17, color: BRAND.navySoft, flexShrink: 1 },
  sparesTimes: {
    position: 'absolute', right: -6, bottom: -6, minWidth: 34, height: 26, paddingHorizontal: 6, borderRadius: 13,
    backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
  },
  sparesTimesText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.white },
});
