/**
 * Collections: the collection book ("dex"), in Alex's look on the shark
 * water background.
 *
 * Top to bottom: the whole-book count (and today's rare), the set cards
 * (rings, a pill only when a set has news, "My hunt", a gift when a reward
 * waits), the gold ribbon set header with the one count ring and two icon
 * buttons (hunt this set, odds), a special-timing chip and the spares meter,
 * the reward track (icon nodes, tap a glowing node to claim), and a 4-column
 * grid of sticker slots. Tap a slot for the big item card.
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
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withRepeat, withSequence, withTiming } from 'react-native-reanimated';
import { Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import type { GiftReceipt } from '../api/endpoints/me/prep-variant-gifts';
import getPrepItemSets, {
  claimSetMilestone, claimSetRewards, claimStarterRewards, clearPrepItemSetFocus, equipSetTitle, exchangeSetDuplicates,
  focusPrepItemSet, getPrepItemSet, type PrepItemSetDetailResponse, type PrepItemSetItem, type PrepItemSetListItem,
} from '../api/endpoints/me/prep-item-sets';
import { getHomeHuntDex, getHomeHuntDexSet } from '../api/endpoints/me/homeHuntDex';
import equipInventoryItem from '../api/endpoints/me/inventory/update-inventory';
import HomeHuntInfoSheet, { useHomeHuntInfo } from '../components/home/HomeHuntInfoSheet';
import { oddsInfoSections } from '../components/home/homeHuntInfoModel';
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
import { BRAND, GameButton, GameIcon } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { showToast } from '../utils/toast';
import GiftPrepVariantPanel from './GiftPrepVariantPanel';
import {
  BookStrip, EventTab, itemArt, RewardTrack, SET_TAB_GAP, SET_TAB_WIDTH, SetHeader, SetTab, SparesMeter, StatusChip, WATER,
} from './SetCollection/DexParts';
import { ItemCard } from './SetCollection/DexItemCard';
import { RewardReveal } from './SetCollection/DexReveal';
import { cachedBook, landOffset, saveLandOffset, storeBook, storeDetail } from './SetCollection/dexCache';
import { getEventShelf, type EventCard, type EventShelf } from './SetCollection/eventCards';
import { ItemTile } from './SetCollection/DexTile';
import { TilePanel } from './SetCollection/dexLook';
import {
  buildBook, buildItems, hasClaimable, initialSlug, mergeStable, refreshEveryMs, spawnIcon, swapGoal, swapProgress, tabStatus,
  type DexBook, type DexItem, type DexReward, type DexSet,
} from './SetCollection/dexModel';
import { ClaimResultCard, MilestonePickSheet } from './SetCollection/SetHuntSections';
import { claimOutcome, wearNavigationParams, type ClaimOutcome, type MilestoneView } from './SetCollection/setHuntModel';

type Detail = PrepItemSetDetailResponse['data'];

const COLUMNS = 4;
const CELL_GAP = 8;
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
  const [oddsOpen, setOddsOpen] = useState(false);
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
  const { info: huntInfo, error: huntInfoError, retry: retryHuntInfo } = useHomeHuntInfo(oddsOpen);
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
      const dex = previewSets ? (previewDex ?? null) : await getHomeHuntDex(locationRef.current);
      const reuse = light && dex != null && legacyList.current != null;
      const legacy = previewSets ?? (reuse ? legacyList.current! : await getPrepItemSets(locationRef.current ?? undefined));
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
      const dex = preview ? (previewDexDetails?.[target] ?? null) : await getHomeHuntDexSet(target, locationRef.current);
      const cached = light && dex != null ? legacyDetail.current[target] : undefined;
      const raw = previewDetails?.[target] ?? cached ?? await getPrepItemSet(target, locationRef.current ?? undefined);
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
  useEffect(() => { if (slug) void loadDetail(slug); }, [slug, loadDetail]);

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
    const x = SIDE + slugIndex * (SET_TAB_WIDTH + SET_TAB_GAP) - (width - SET_TAB_WIDTH) / 2;
    pickerRef.current?.scrollTo({ x: Math.max(0, x), animated });
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
    setPopKey(key => key + 1);
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
        setError('That reward did not go through. Try again.');
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
      showToast('Could not put it on. Open Inventory to wear it.', 'warning');
    } finally {
      setWearing(false);
    }
    RootNavigation.navigate('Inventory', wearNavigationParams(wear));
  }, [claimResult, wearing, refreshPlayer]);

  const toggleTitle = useCallback(async () => {
    if (!set?.reward.title || busy || preview) return;
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
    playSfx('ui.tap', 0.6);
    try {
      if (preview) {
        setBook(current => ({ ...current, sets: current.sets.map(entry => ({ ...entry, focused: desired && entry.slug === set.slug })) }));
      } else {
        if (desired) await focusPrepItemSet(set.slug);
        else await clearPrepItemSetFocus();
        await loadSets();
      }
      void Haptics.selectionAsync().catch(() => undefined);
    } catch {
      const list = await loadSets();
      if (list.find(entry => entry.slug === set.slug)?.focused !== desired) setError('Could not change your hunt. Try again.');
    } finally {
      setBusy(null);
    }
  }, [set, busy, preview, loadSets]);

  const exchange = useCallback(async () => {
    if (!set || !selectedItem || busy) return;
    const target = selectedItem.id;
    setBusy('exchange');
    setError(null);
    try {
      if (preview) {
        setDetail(current => current && {
          ...current, spares: Math.max(0, current.spares - selectedItem.exchangeCost),
          items: current.items.map(item => item.id === target ? { ...item, found: true, caught: 1, foundInWorld: false, isNew: true } : item),
        });
      } else {
        await exchangeSetDuplicates(set.slug, target);
        await reloadAll();
      }
      setSelectedItem(current => current ? { ...current, found: true, isNew: true, foundInWorld: false, caught: Math.max(1, current.caught) } : current);
      playSfx('fx.reveal', 0.8);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch {
      setError('That swap did not go through. Try again.');
      playSfx('fx.nopeShort', 0.6);
      await reloadAll();
    } finally {
      setBusy(null);
    }
  }, [set, selectedItem, busy, preview, reloadAll]);

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

  // A reward waiting: make sure its Claim button sits above the compass, once per set.
  const listRef = useRef<FlashList<DexItem | number>>(null);
  const viewportH = useRef(0);
  const trackBottom = useRef(0);
  const revealedFor = useRef<string | null>(null);
  const claimReady = !!set && (set.reward.status === 'claimable' || set.steps.some(step => step.status === 'claimable'));
  const pickerBottom = useRef(0);
  const scrollY = useRef(0);
  // First land on a claim: with a cached book the claim offset from the last visit is applied as the list's
  // initial contentOffset (no paint at the top, no scroll, no hidden page). With no cache the list stays hidden
  // only until its first layout pass decides the offset; the safety timer starts at that first layout.
  // Read once at mount: the stored offsets load from disk asynchronously, and a value that appears after the list
  // mounted was never applied as its contentOffset.
  const [seededOffset] = useState(() => (seed ? landOffset(player?.id, seedSlug) : null));
  const firstLand = useRef(true);
  const seedSet = seed?.book.sets.find(entry => entry.slug === seedSlug);
  const seedClaim = !!seedSet && hasClaimable(seedSet);
  // Visible from the first frame when the cached page needs no scroll, or we already know where to start.
  const startVisible = seededOffset != null || (!!seed && !seedClaim);
  const [landed, setLanded] = useState(startVisible);
  const listFade = useSharedValue(startVisible ? 1 : 0);
  const revealTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (revealTimer.current) clearTimeout(revealTimer.current); }, []);
  const showList = () => {
    if (landed) return;
    setLanded(true);
    listFade.value = reduced ? 1 : withTiming(1, { duration: 140 });
  };
  const listFadeStyle = useAnimatedStyle(() => ({ opacity: listFade.value }));
  const safetyArmed = useRef(false);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (safetyTimer.current) clearTimeout(safetyTimer.current); }, []);
  const armSafety = () => {
    if (safetyArmed.current || landed) return;
    safetyArmed.current = true;
    safetyTimer.current = setTimeout(() => { setLanded(true); listFade.value = 1; }, 700);
  };
  const revealClaim = () => {
    if (!set || !claimReady || revealedFor.current === set.slug || !viewportH.current || !trackBottom.current) {
      if (set && !claimReady) { firstLand.current = false; showList(); }
      return;
    }
    revealedFor.current = set.slug;
    const overflow = trackBottom.current - (viewportH.current - CTA_CLEARANCE + 24);
    if (overflow <= 0) { firstLand.current = false; showList(); return; }
    // Never stop with the set cards cut in half: scroll them fully off (the ribbon header leads) when we must move.
    const offset = Math.max(overflow, pickerBottom.current);
    saveLandOffset(player?.id, set.slug, offset);
    // First land only: jump there before the list is shown (no visible scroll from the picker to the claim panel).
    // Later set switches keep the animated scroll.
    if (firstLand.current) {
      firstLand.current = false;
      // Always set it: a no-op when the seeded contentOffset already holds, the fix when it did not.
      listRef.current?.scrollToOffset({ offset, animated: false });
      showList();
      return;
    }
    revealTimer.current = setTimeout(() => listRef.current?.scrollToOffset({ offset, animated: !reduced }), 350);
  };
  const goal = swapGoal(items ?? [], spares, detail?.raw.progress.exchange_cost ?? 4);
  const cell = Math.floor((width - SIDE * 2 - CELL_GAP * (COLUMNS - 1)) / COLUMNS);
  const status = set ? tabStatus(set) : null;
  // The chip under the header shows special timing, live or not ("Sunset to 9 PM" with the live dot meaning on now).
  const special = status;
  // Today's rare is worth a trip until it is caught: not spawned yet (available) or waiting on the map (onMap).
  const daily = !!book.dailyRare && !book.dailyRare.caughtToday && (book.dailyRare.available || book.dailyRare.onMap);

  const header = (
    <View>
      <BookStrip found={book.found} total={book.total} dailyRare={daily} onDaily={goToMap} />
      <ScrollView ref={pickerRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}
        onLayout={event => { pickerBottom.current = event.nativeEvent.layout.y + event.nativeEvent.layout.height; }}
        style={styles.pickerBleed} onContentSizeChange={() => centerPicker(false)}>
        {sets.map(entry => <SetTab key={entry.slug} set={entry} selected={entry.slug === slug} onPress={chooseSet} />)}
        {eventsReady && events.cards.map((card, index) => (
          <EventTab key={`event-${card.eventSlug}`} card={card} lifetimeHaunts={index === 0 ? events.lifetimeHaunts : null} onPress={openEvent} />
        ))}
      </ScrollView>
      {set && (
        <>
          <SetHeader set={set} stamp={stamp?.slug === set.slug ? stamp.title : null} focusBusy={busy === 'focus'} onOdds={() => { playSfx('ui.tap', 0.5); setOddsOpen(true); }}
            onFocus={set.status === 'active' || set.status === 'resting' ? () => void toggleFocus() : null} />
          <View style={styles.chips}>
            {special && <StatusChip text={special.text} icon={spawnIcon(special.text)} />}
            <SparesMeter spares={spares} cost={goal.cost} ready={goal.ready} extra={goal.extra} anyMissing={goal.anyMissing}
              onPress={() => { playSfx('ui.tap', 0.5); setSparesOpen(true); }} />
          </View>
          <View onLayout={event => { trackBottom.current = event.nativeEvent.layout.y + event.nativeEvent.layout.height; revealClaim(); }}>
          <RewardTrack set={set} busyId={busy} onClaim={reward => void claim(reward)}
            titleWorn={!!set.reward.title && player?.title === set.reward.title} titleBusy={busy === 'title'}
            onTitle={set.reward.title && !preview ? () => void toggleTitle() : null} popKey={popKey} />
          </View>
          {claimResult && (
            <View style={{ marginTop: 10 }}>
              <ClaimResultCard outcome={claimResult} wearing={wearing} onWear={() => void wearIt()} onDismiss={() => setClaimResult(null)} />
            </View>
          )}
          {!!error && !selectedItem && <Text style={styles.error}>{error}</Text>}
          {detailError && !items && (
            <View style={styles.center}>
              <Text style={styles.emptyTitle}>This page did not load</Text>
              <GameButton label="Try again" icon="retry" onPress={() => slug && void loadDetail(slug)} />
            </View>
          )}
          <View style={{ height: 14 }} />
        </>
      )}
    </View>
  );

  const data: (DexItem | number)[] = items ?? (detailError ? [] : Array.from({ length: Math.min(12, set?.total || 8) }, (_, index) => index));

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

      <View style={styles.page} onLayout={event => { viewportH.current = event.nativeEvent.layout.height; revealClaim(); }}>
        <Image source={WATER} style={StyleSheet.absoluteFill} contentFit="cover" priority="high" cachePolicy="memory" transition={0} />
        <View style={[StyleSheet.absoluteFill, styles.dim]} />
        {loading ? (
          <BookSkeleton cell={cell} />
        ) : listError ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Your book did not load</Text>
            <GameButton label="Try again" icon="retry" onPress={() => { setLoading(true); void loadSets(); }} />
          </View>
        ) : sets.length === 0 ? (
          <View style={styles.center}>
            <GameIcon name="search" size={64} />
            <Text style={styles.emptyTitle}>Catch your first find!</Text>
            <GameButton label="Open the map" icon="map" onPress={goToMap} />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
          {!landed && <View style={StyleSheet.absoluteFill} pointerEvents="none"><BookSkeleton cell={cell} /></View>}
          <Animated.View style={[{ flex: 1 }, listFadeStyle]}>
          <FlashList
            ref={listRef}
            contentOffset={seededOffset != null ? { x: 0, y: seededOffset } : undefined}
            onLayout={armSafety}
            onScroll={event => { scrollY.current = event.nativeEvent.contentOffset.y; }}
            scrollEventThrottle={64}
            data={data}
            numColumns={COLUMNS}
            estimatedItemSize={cell + 46}
            keyExtractor={entry => (typeof entry === 'number' ? `ghost-${entry}` : String(entry.id))}
            ListHeaderComponent={header}
            extraData={spares}
            contentContainerStyle={{ paddingHorizontal: SIDE - CELL_GAP / 2, paddingBottom: CTA_CLEARANCE }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: entry }) => (
              <View style={{ paddingHorizontal: CELL_GAP / 2 }}>
                {typeof entry === 'number'
                  ? <TilePanel rarity={1} found={false} style={{ width: cell, height: cell, marginBottom: 46, opacity: 0.5 }} />
                  : <ItemTile item={entry} width={cell} swapReady={swapProgress(entry, spares).ready} onPress={openItem} />}
              </View>
            )}
          />
          </Animated.View>
          </View>
        )}
      </View>

      <ItemCard item={selectedItem} set={set} spares={spares} onClose={closeItem} error={error} onFind={goToMap}
        exchanging={busy === 'exchange'} onExchange={set && set.status !== 'retired' ? () => void exchange() : null}
        onShare={preview && process.env.EXPO_PUBLIC_CREW_GIFT_PREVIEW !== '1' ? null : () => {
          playSfx('ui.tap', 0.5);
          setGiftItem(selectedItem);
          setSelectedItem(null);
        }} />

      <Modal visible={giftItem != null} transparent animationType="fade" onRequestClose={() => setGiftItem(null)}>
        <View style={styles.sheetOverlay}>
          <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" style={StyleSheet.absoluteFill} onPress={() => setGiftItem(null)} />
          <View style={styles.giftCard} accessibilityViewIsModal>
            {giftItem && (
              <GiftPrepVariantPanel item={{ id: giftItem.id, name: giftItem.name } as PrepItemSetItem} imageSource={itemArt(giftItem)}
                onBack={() => { setSelectedItem(giftItem); setGiftItem(null); }} onClose={() => setGiftItem(null)}
                onSent={giftSent} onFindFriends={() => { setGiftItem(null); RootNavigation.navigate('Friends'); }} />
            )}
          </View>
        </View>
      </Modal>

      <SparesSheet visible={sparesOpen} items={items ?? []} cost={goal.cost} onClose={() => setSparesOpen(false)} />
      {/* The build-up rides in its own window, or inside the wearable sheet when the claim came from there
          (iOS shows one modal at a time, so a second window would never cover the sheet). */}
      <Modal visible={claimWaiting && !picking} transparent animationType="none" statusBarTranslucent>
        {buildUp}
      </Modal>
      <RewardReveal reveal={reveal} onClose={() => {
        const won = reveal;
        setReveal(null);
        // Back in the book: the title stamps onto the set's ribbon (the card ring is already gold).
        if (won?.reward.title) {
          setStamp({ slug: won.set.slug, title: won.reward.title });
          playSfx('ui.confirm', 0.7);
        }
        // After the stamp beat, ease the done panel (and its Wear title button) clear of the compass.
        if (revealTimer.current) clearTimeout(revealTimer.current);
        revealTimer.current = setTimeout(() => {
          // Down only, and never to a stop that cuts the set cards in half (same rule as the claim landing).
          const overflow = trackBottom.current - (viewportH.current - CTA_CLEARANCE + 24);
          const offset = Math.max(overflow, pickerBottom.current);
          if (viewportH.current && overflow > scrollY.current + 2) listRef.current?.scrollToOffset({ offset, animated: !reduced });
        }, 700);
      }} />
      <MilestonePickSheet view={picking && set ? pickView(picking, set.found) : null} busy={busy != null}
        overlay={claimWaiting ? buildUp : null}
        onConfirm={itemId => { if (picking) void claim(picking, itemId); }} onClose={() => setPicking(null)} />
      <HomeHuntInfoSheet visible={oddsOpen} title="Drop odds" sections={oddsInfoSections(huntInfo)}
        loading={!huntInfo} error={huntInfoError} onRetry={retryHuntInfo} onClose={() => setOddsOpen(false)} />
    </Wrapper>
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
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
      accessible accessibilityLabel="Claiming your reward">
      <Animated.View style={[{ width: 220, height: 220, borderRadius: 110, backgroundColor: BRAND.gold }, glow]} />
      <View style={{ position: 'absolute' }}><GameIcon name="gift" size={96} /></View>
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
function BookSkeleton({ cell }: { readonly cell: number }) {
  return (
    <View style={{ paddingHorizontal: SIDE }} accessibilityLabel="Loading your book" accessible>
      <View style={[styles.skel, { height: 56, marginTop: 12 }]} />
      <View style={{ flexDirection: 'row', gap: SET_TAB_GAP, marginTop: 16 }}>
        {[0, 1, 2].map(index => <View key={index} style={[styles.skel, { width: SET_TAB_WIDTH, height: 148, borderRadius: 22 }]} />)}
      </View>
      <View style={[styles.skel, { height: 58, marginTop: 16, borderRadius: 29 }]} />
      <View style={[styles.skel, { height: 150, marginTop: 14 }]} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: CELL_GAP, marginTop: 14 }}>
        {Array.from({ length: 8 }, (_, index) => <View key={index} style={[styles.skel, { width: cell, height: cell, borderRadius: 16 }]} />)}
      </View>
    </View>
  );
}

/** One picture with the real price: N spare copies (one stack, "xN") swap for one new find. */
function SparesSheet({ visible, items, cost, onClose }: {
  readonly visible: boolean; readonly items: readonly DexItem[]; readonly cost: number; readonly onClose: () => void;
}) {
  const spare = items.find(item => item.found && item.spares > 0) ?? items.find(item => item.found) ?? null;
  const missing = items.filter(item => !item.found).sort((a, b) => a.exchangeCost - b.exchangeCost)[0] ?? null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sparesCard} accessibilityViewIsModal>
          <Text style={styles.sparesTitle} accessibilityRole="header">Spares swap for new finds!</Text>
          <View style={styles.sparesRow} accessible accessibilityLabel={`${cost} spare copies swap for 1 new find`}>
            <View style={styles.sparesStack}>
              {[2, 1, 0].map(offset => (
                <TilePanel key={offset} rarity={spare?.rarity ?? 1} found
                  style={[styles.sparesTile, { position: offset ? 'absolute' : 'relative', left: offset * 6, top: -offset * 6 }]}>
                  {spare && <Image source={itemArt(spare)} style={styles.sparesArt} contentFit="contain" />}
                </TilePanel>
              ))}
              <View style={styles.sparesTimes}><Text style={styles.sparesTimesText}>x{cost}</Text></View>
            </View>
            <GameIcon name="swap" size={44} />
            <TilePanel rarity={missing?.rarity ?? 2} found style={styles.sparesTile}>
              {missing && <Image source={itemArt(missing)} style={styles.sparesArt} contentFit="contain" />}
              <View style={styles.sparesNew}><GameIcon name="new" size={30} /></View>
            </TilePanel>
          </View>
          <GameButton label="Got it" icon="check" onPress={onClose} style={{ marginTop: 16 }} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // The water art's own average color, so the push never shows a plain blue frame while it decodes.
  page: { flex: 1, marginTop: -8, backgroundColor: '#11b8db' },
  dim: { backgroundColor: 'rgba(5,52,110,0.2)' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 12, width: '100%' },
  emptyTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.white, textAlign: 'center' },
  picker: { paddingHorizontal: SIDE, paddingTop: 16, paddingBottom: 12 },
  // The list pads its cells; the picker bleeds to the screen edges so cards are cut by the screen, not a clip line.
  pickerBleed: { marginHorizontal: -(SIDE - CELL_GAP / 2) },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: SIDE, marginTop: 12 },
  error: {
    fontFamily: 'Knockout', fontSize: 17, color: BRAND.navy, marginHorizontal: SIDE, marginTop: 10, padding: 10, borderRadius: 12,
    backgroundColor: BRAND.white, overflow: 'hidden',
  },
  skel: { borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.28)', borderWidth: 3, borderColor: 'rgba(255,255,255,0.35)' },
  sheetOverlay: { flex: 1, backgroundColor: 'rgba(5,52,110,0.86)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  giftCard: { width: '100%', maxWidth: 400, padding: 16, borderRadius: 24, backgroundColor: '#E9F7FF', borderWidth: 3, borderColor: BRAND.white },
  sparesCard: {
    width: '100%', maxWidth: 380, padding: 18, borderRadius: 24, backgroundColor: '#1a8fe3', borderWidth: 4, borderColor: BRAND.white,
    borderBottomWidth: 8, borderBottomColor: '#0b5aa0', alignItems: 'center',
  },
  sparesTitle: { fontFamily: 'Shark', fontSize: 24, color: BRAND.white, textAlign: 'center' },
  sparesRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  sparesTile: { width: 70, height: 70, justifyContent: 'center' },
  sparesArt: { width: 52, height: 52 },
  sparesNew: { position: 'absolute', bottom: 0, left: 0 },
  sparesStack: { width: 84, height: 84, justifyContent: 'flex-end' },
  sparesTimes: {
    position: 'absolute', right: -6, bottom: -6, minWidth: 40, height: 30, paddingHorizontal: 6, borderRadius: 15,
    backgroundColor: BRAND.navy, borderWidth: 2, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
  },
  sparesTimesText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white },
});
