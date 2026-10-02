/**
 * Collections: the collection book ("dex").
 *
 * - Set picker: colored cards with progress rings, swipe sideways.
 * - Reward banner: "Finish the set: get X" with its claim state, plus one slim
 *   row for an earlier step (Trip Prep or the next milestone) when there is one.
 * - Item grid: finds in full color with their caught count, missing items as
 *   dark silhouettes with a rarity color. Tap any tile for the big item card
 *   (art or Ride Photo, name, flavor, rarity, caught count, where or when it
 *   spawns, swap spares, share a spare).
 * - Small chips: live status, spares, "Hunt this set" focus, drop odds.
 *
 * Data: legacy /me/prep-item-sets endpoints, overlaid with the optional Home
 * Hunt v3 dex endpoints (see dexModel.ts). Works against either server.
 */
import { useIsFocused, useRoute } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { GiftReceipt } from '../api/endpoints/me/prep-variant-gifts';
import getPrepItemSets, {
  claimSetMilestone, claimSetRewards, claimStarterRewards, clearPrepItemSetFocus, equipSetTitle, exchangeSetDuplicates,
  focusPrepItemSet, getPrepItemSet, type PrepItemSetDetailResponse, type PrepItemSetItem, type PrepItemSetListItem,
} from '../api/endpoints/me/prep-item-sets';
import { getHomeHuntDex, getHomeHuntDexSet } from '../api/endpoints/me/homeHuntDex';
import equipInventoryItem from '../api/endpoints/me/inventory/update-inventory';
import HomeHuntInfoSheet, { useHomeHuntInfo } from '../components/home/HomeHuntInfoSheet';
import { oddsInfoSections } from '../components/home/homeHuntInfoModel';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import { playSfx } from '../gamekit/SFX';
import * as Haptics from '../helpers/haptics';
import type { ItemType } from '../models/item-type';
import * as RootNavigation from '../RootNavigation';
import { BRAND, GameButton, GameIcon, SharkLoader } from '../ui';
import { showToast } from '../utils/toast';
import GiftPrepVariantPanel from './GiftPrepVariantPanel';
import {
  ItemCard, ItemTile, itemArt, RewardBanner, RewardReveal, SetChips, setBadge, SetTab, StarBurst, StepRow,
} from './SetCollection/DexParts';
import {
  buildBook, buildItems, hasClaimable, initialSlug, nextStep,
  type DexItem, type DexReward, type DexSet,
} from './SetCollection/dexModel';
import { ClaimResultCard, MilestonePickSheet } from './SetCollection/SetHuntSections';
import { claimOutcome, wearNavigationParams, type ClaimOutcome, type MilestoneView } from './SetCollection/setHuntModel';

type Detail = PrepItemSetDetailResponse['data'];

const COLUMNS = 3;
const GRID_GAP = 10;

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
  const { width } = useWindowDimensions();
  const { player, refreshPlayer } = useContext(AuthContext);
  const { location } = useContext(LocationContext);
  const locationRef = useRef(location);
  locationRef.current = location;
  const preview = previewSets != null;

  const [sets, setSets] = useState<DexSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [slug, setSlug] = useState<string | null>(linkedSlug);
  const [detail, setDetail] = useState<{ slug: string; raw: Detail; items: DexItem[] } | null>(null);
  const [detailError, setDetailError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedItem, setSelectedItem] = useState<DexItem | null>(null);
  const [giftItem, setGiftItem] = useState<DexItem | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState<DexReward | null>(null);
  const [claimResult, setClaimResult] = useState<ClaimOutcome | null>(null);
  const [wearing, setWearing] = useState(false);
  const [oddsOpen, setOddsOpen] = useState(false);
  const [popKey, setPopKey] = useState(0);
  const [reveal, setReveal] = useState<{ set: DexSet; reward: DexReward; key: number } | null>(null);
  const { info: huntInfo, error: huntInfoError, retry: retryHuntInfo } = useHomeHuntInfo(oddsOpen);
  const pickerRef = useRef<ScrollView>(null);

  const loadSets = useCallback(async (): Promise<DexSet[]> => {
    try {
      const [legacy, dex] = await Promise.all([
        previewSets ?? getPrepItemSets(locationRef.current ?? undefined),
        previewSets ? Promise.resolve(previewDex ?? null) : getHomeHuntDex(locationRef.current),
      ]);
      const book = buildBook(legacy, dex);
      setSets(book.sets as DexSet[]);
      setListError(false);
      setSlug(current => (current && book.sets.some(set => set.slug === current) ? current : initialSlug(book.sets, linkedSlug)));
      return book.sets as DexSet[];
    } catch {
      setListError(true);
      return [];
    } finally {
      setLoading(false);
    }
  }, [previewSets, previewDex, linkedSlug]);

  const loadDetail = useCallback(async (target: string) => {
    try {
      const [raw, dex] = await Promise.all([
        previewDetails?.[target] ?? getPrepItemSet(target, locationRef.current ?? undefined),
        preview ? Promise.resolve(previewDexDetails?.[target] ?? null) : getHomeHuntDexSet(target, locationRef.current),
      ]);
      const dexItems = (dex as { items?: unknown } | null)?.items;
      setDetail({ slug: target, raw, items: buildItems(raw, dexItems) });
      setDetailError(false);
    } catch {
      setDetailError(true);
    }
  }, [previewDetails, previewDexDetails, preview]);

  useEffect(() => { void loadSets(); }, [loadSets]);
  useEffect(() => { if (slug) void loadDetail(slug); }, [slug, loadDetail]);

  // Live rain or night status can change while the book is open. No polling off-screen.
  useEffect(() => {
    if (!isFocused || preview) return;
    const timer = setInterval(() => {
      void loadSets();
      if (slug) void loadDetail(slug);
    }, 60_000);
    return () => clearInterval(timer);
  }, [isFocused, preview, loadSets, loadDetail, slug]);

  const set = useMemo(() => sets.find(entry => entry.slug === slug) ?? null, [sets, slug]);
  const items = detail && detail.slug === slug ? detail.items : null;
  const spares = detail && detail.slug === slug ? Math.max(0, detail.raw.progress.spare_count ?? 0) : set?.spares ?? 0;
  const step = set ? nextStep(set) : null;

  const reloadAll = useCallback(async () => {
    const list = await loadSets();
    if (slug) await loadDetail(slug);
    return list;
  }, [loadSets, loadDetail, slug]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await reloadAll();
    setRefreshing(false);
  }, [reloadAll]);

  const chooseSet = (next: string) => {
    if (next === slug) return;
    playSfx('fx.whoosh', 0.35);
    void Haptics.selectionAsync().catch(() => undefined);
    setError(null);
    setClaimResult(null);
    setSlug(next);
  };

  const celebrate = (reward?: DexReward) => {
    playSfx('fx.reward', 0.9);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setPopKey(key => key + 1);
    if (reward && set) setReveal({ set, reward, key: Date.now() });
  };

  const claim = useCallback(async (reward: DexReward, itemId?: number) => {
    if (!set || busy) return;
    if (reward.needsPick && itemId == null) {
      playSfx('ui.tap', 0.6);
      setPicking(reward);
      return;
    }
    setBusy(reward.id);
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    try {
      if (preview) {
        setSets(current => current.map(entry => entry.slug !== set.slug ? entry : {
          ...entry,
          reward: entry.reward.id === reward.id ? { ...entry.reward, status: 'claimed' } : entry.reward,
          steps: entry.steps.map(s => s.id === reward.id ? { ...s, status: 'claimed' } : s),
        }));
      } else if (reward.claim.kind === 'complete') {
        await claimSetRewards(set.slug);
      } else if (reward.claim.kind === 'starter') {
        await claimStarterRewards(set.slug, itemId);
      } else {
        const result = await claimSetMilestone(set.slug, reward.claim.key, itemId);
        const outcome = claimOutcome(result);
        setClaimResult(outcome);
        if (outcome.toast) showToast(outcome.toast, 'success');
      }
      setPicking(null);
      celebrate(reward);
      if (!preview) {
        await refreshPlayer().catch(() => undefined);
        await reloadAll();
      }
    } catch {
      // A lost response can follow a saved claim. Read it back before blaming the player.
      const list = await reloadAll();
      const fresh = list.find(entry => entry.slug === set.slug);
      const after = fresh ? [fresh.reward, ...fresh.steps].find(entry => entry.id === reward.id) : null;
      if (after && (after.status === 'claimed' || after.status === 'pending')) {
        setPicking(null);
        celebrate(reward);
        await refreshPlayer().catch(() => undefined);
      } else {
        setError('That reward did not go through. Try again.');
        playSfx('fx.nopeShort', 0.6);
      }
    } finally {
      setBusy(null);
    }
  }, [set, busy, preview, refreshPlayer, reloadAll]);

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
        setSets(current => current.map(entry => ({ ...entry, focused: desired && entry.slug === set.slug })));
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
          ...current, items: current.items.map(item => item.id === target ? { ...item, found: true, caught: 1, foundInWorld: false } : item),
        });
      } else {
        await exchangeSetDuplicates(set.slug, target);
        await reloadAll();
      }
      setSelectedItem(current => current ? { ...current, found: true, isNew: true, foundInWorld: false, caught: Math.max(1, current.caught) } : current);
      playSfx('fx.reveal', 0.8);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    } catch {
      setError('That swap did not go through. Check your spares and try again.');
      playSfx('fx.nopeShort', 0.6);
      await reloadAll();
    } finally {
      setBusy(null);
    }
  }, [set, selectedItem, busy, preview, reloadAll]);

  const openItem = useCallback((item: DexItem) => {
    // Layered: a tap, then a sparkle for a find you own.
    playSfx('ui.tap', 0.55);
    if (item.found) playSfx(item.rarity >= 4 ? 'fx.reveal' : 'fx.hit', item.rarity >= 4 ? 0.55 : 0.35);
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
    celebrate();
    void reloadAll();
  }, [reloadAll]); // eslint-disable-line react-hooks/exhaustive-deps

  const tileSize = Math.floor((width - 32 - GRID_GAP * (COLUMNS - 1)) / COLUMNS);

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

      <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 150 }} showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={BRAND.navySoft} />}>
        {loading ? (
          <View style={styles.center}><SharkLoader state="loading" /></View>
        ) : listError ? (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Your book did not load</Text>
            <GameButton label="Try again" icon="retry" onPress={() => { setLoading(true); void loadSets(); }} />
          </View>
        ) : sets.length === 0 ? (
          <View style={styles.center}>
            <GameIcon name="search" size={64} />
            <Text style={styles.emptyTitle}>Catch your first find on the map!</Text>
            <GameButton label="Open the map" icon="map" onPress={() => RootNavigation.navigate('Explore')} />
          </View>
        ) : (
          <>
            <ScrollView ref={pickerRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>
              {sets.map(entry => (
                <SetTab key={entry.slug} set={entry} selected={entry.slug === slug} onPress={() => chooseSet(entry.slug)} />
              ))}
            </ScrollView>

            {set && (
              <SetHeader key={set.slug} set={set} />
            )}
            {set && (
              <SetChips set={set} focusBusy={busy === 'focus'} onOdds={() => { playSfx('ui.tap', 0.5); setOddsOpen(true); }}
                onFocus={set.status === 'active' || set.status === 'resting' ? () => void toggleFocus() : null} />
            )}

            {set && (
              <View>
                <RewardBanner set={set} reward={set.reward} busy={busy === set.reward.id} onClaim={() => void claim(set.reward)}
                  titleWorn={!!set.reward.title && player?.title === set.reward.title} titleBusy={busy === 'title'}
                  onTitle={set.reward.title && !preview ? () => void toggleTitle() : null} popKey={popKey} />
                {popKey > 0 && <StarBurst key={popKey} size={260} />}
              </View>
            )}
            {set && step && <StepRow step={step} busy={busy === step.id} onClaim={() => void claim(step)} />}
            {claimResult && (
              <View style={{ marginTop: 10 }}>
                <ClaimResultCard outcome={claimResult} wearing={wearing} onWear={() => void wearIt()} onDismiss={() => setClaimResult(null)} />
              </View>
            )}
            {!!error && !selectedItem && <Text style={styles.error}>{error}</Text>}

            <View style={styles.grid}>
              {items ? items.map((item, index) => (
                <ItemTile key={item.id} item={item} index={index} size={tileSize} color={set?.color ?? BRAND.blue} onPress={openItem} />
              )) : detailError ? (
                <View style={styles.center}>
                  <Text style={styles.emptyTitle}>This page did not load</Text>
                  <GameButton label="Try again" icon="retry" onPress={() => slug && void loadDetail(slug)} />
                </View>
              ) : (
                Array.from({ length: Math.min(12, set?.total || 9) }, (_, index) => (
                  <View key={index} style={[styles.ghostTile, { width: tileSize, height: tileSize + 22 }]} />
                ))
              )}
            </View>
          </>
        )}
      </ScrollView>

      <ItemCard item={selectedItem} set={set} spares={spares} onClose={closeItem} error={error}
        sharkName={player?.username}
        exchanging={busy === 'exchange'} onExchange={set ? () => void exchange() : null}
        onShare={preview && process.env.EXPO_PUBLIC_CREW_GIFT_PREVIEW !== '1' ? null : () => {
          playSfx('ui.tap', 0.5);
          setGiftItem(selectedItem);
          setSelectedItem(null);
        }} />

      <Modal visible={giftItem != null} transparent animationType="fade" onRequestClose={() => setGiftItem(null)}>
        <Pressable style={styles.giftOverlay} onPress={() => setGiftItem(null)}>
          <Pressable style={styles.giftCard} onPress={() => undefined}>
            {giftItem && (
              <GiftPrepVariantPanel item={{ id: giftItem.id, name: giftItem.name } as PrepItemSetItem} imageSource={itemArt(giftItem)}
                onBack={() => { setSelectedItem(giftItem); setGiftItem(null); }} onClose={() => setGiftItem(null)}
                onSent={giftSent} onFindFriends={() => { setGiftItem(null); RootNavigation.navigate('Friends'); }} />
            )}
          </Pressable>
        </Pressable>
      </Modal>

      <RewardReveal reveal={reveal} onClose={() => { playSfx('ui.tap', 0.5); setReveal(null); }} />
      <MilestonePickSheet view={picking && set ? pickView(picking, set.found) : null} busy={busy != null}
        onConfirm={itemId => { if (picking) void claim(picking, itemId); }} onClose={() => setPicking(null)} />
      <HomeHuntInfoSheet visible={oddsOpen} title="Drop odds" sections={oddsInfoSections(huntInfo)}
        loading={!huntInfo} error={huntInfoError} onRetry={retryHuntInfo} onClose={() => setOddsOpen(false)} />
    </Wrapper>
  );
}

/** Set title with a springy entrance each time the page changes. */
function SetHeader({ set }: { readonly set: DexSet }) {
  const enter = useSharedValue(0);
  useEffect(() => {
    enter.value = withSequence(withTiming(0, { duration: 0 }), withSpring(1, { damping: 12, stiffness: 190 }));
  }, [enter]);
  const style = useAnimatedStyle(() => ({ opacity: enter.value, transform: [{ translateY: (1 - enter.value) * 14 }] }));
  const ready = hasClaimable(set);
  return (
    <Animated.View style={[styles.header, style]}>
      <View style={[styles.headerBadge, { borderColor: set.color }]}>
        <Image source={setBadge(set)} style={{ width: 46, height: 46 }} contentFit="contain" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.headerTitle} numberOfLines={1}>{set.name}</Text>
        {!!set.description && <Text style={styles.headerSub} numberOfLines={2}>{set.description}</Text>}
      </View>
      <View style={[styles.headerCount, { borderColor: set.color }]}>
        <Text style={[styles.headerCountBig, { color: set.isComplete ? BRAND.goldLip : BRAND.navy }]}>{set.found}</Text>
        <Text style={styles.headerCountSmall}>of {set.total}</Text>
      </View>
      {ready && <View style={styles.headerGift}><GameIcon name="gift" size={26} /></View>}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, marginTop: -8, backgroundColor: '#e3f3ff' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 50, paddingHorizontal: 24, gap: 12, width: '100%' },
  emptyTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, textAlign: 'center' },
  picker: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 8 },
  header: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 16, marginTop: 8, gap: 10 },
  headerBadge: {
    width: 60, height: 60, borderRadius: 30, borderWidth: 4, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
  },
  headerTitle: { fontFamily: 'Shark', fontSize: 28, color: BRAND.navy },
  headerSub: { fontFamily: 'Knockout', fontSize: 16, lineHeight: 20, color: BRAND.navySoft },
  headerCount: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 4, backgroundColor: BRAND.white, alignItems: 'center', justifyContent: 'center',
  },
  headerCountBig: { fontFamily: 'Shark', fontSize: 24, lineHeight: 26 },
  headerCountSmall: { fontFamily: 'Knockout', fontSize: 12, color: BRAND.navySoft, marginTop: -2 },
  headerGift: { position: 'absolute', right: -4, top: -6 },
  error: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.redLip, marginHorizontal: 16, marginTop: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GRID_GAP, paddingHorizontal: 16, marginTop: 14 },
  ghostTile: { borderRadius: 18, backgroundColor: '#d4e6f6' },
  giftOverlay: { flex: 1, backgroundColor: 'rgba(5,52,110,0.55)', alignItems: 'center', justifyContent: 'center', padding: 18 },
  giftCard: { width: '100%', maxWidth: 400, padding: 16, borderRadius: 24, backgroundColor: '#E9F7FF', borderWidth: 3, borderColor: BRAND.white },
});
