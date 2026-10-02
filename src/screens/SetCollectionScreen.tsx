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
import { BRAND, GameButton, GameIcon, SharkLoader } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { showToast } from '../utils/toast';
import GiftPrepVariantPanel from './GiftPrepVariantPanel';
import {
  BookStrip, itemArt, RewardTrack, SET_TAB_GAP, SET_TAB_WIDTH, SetHeader, SetTab, SparesMeter, StatusChip, WATER,
} from './SetCollection/DexParts';
import { ItemCard } from './SetCollection/DexItemCard';
import { RewardReveal } from './SetCollection/DexReveal';
import { ItemTile } from './SetCollection/DexTile';
import { TilePanel } from './SetCollection/dexLook';
import {
  buildBook, buildItems, initialSlug, mergeStable, refreshEveryMs, spawnIcon, swapProgress, tabStatus,
  type DexBook, type DexItem, type DexReward, type DexSet,
} from './SetCollection/dexModel';
import { ClaimResultCard, MilestonePickSheet } from './SetCollection/SetHuntSections';
import { claimOutcome, wearNavigationParams, type ClaimOutcome, type MilestoneView } from './SetCollection/setHuntModel';

type Detail = PrepItemSetDetailResponse['data'];

const COLUMNS = 4;
const CELL_GAP = 8;
const SIDE = 16;

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

  const [book, setBook] = useState<DexBook>({ sets: [], found: 0, total: 0, dailyRare: null });
  const sets = book.sets;
  const bookKey = useRef('');
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [slug, setSlug] = useState<string | null>(linkedSlug);
  const [detail, setDetail] = useState<{ slug: string; raw: Detail; items: DexItem[]; spares: number } | null>(null);
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
  const { info: huntInfo, error: huntInfoError, retry: retryHuntInfo } = useHomeHuntInfo(oddsOpen);
  const pickerRef = useRef<ScrollView>(null);

  const loadSets = useCallback(async (): Promise<DexSet[]> => {
    try {
      const [legacy, dex] = await Promise.all([
        previewSets ?? getPrepItemSets(locationRef.current ?? undefined),
        previewSets ? Promise.resolve(previewDex ?? null) : getHomeHuntDex(locationRef.current),
      ]);
      const next = buildBook(legacy, dex);
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

  const loadDetail = useCallback(async (target: string) => {
    try {
      const [raw, dex] = await Promise.all([
        previewDetails?.[target] ?? getPrepItemSet(target, locationRef.current ?? undefined),
        preview ? Promise.resolve(previewDexDetails?.[target] ?? null) : getHomeHuntDexSet(target, locationRef.current),
      ]);
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

  // Back on screen: refresh once. While open: fast only for a timed set, else every 5 minutes.
  useFocusEffect(useCallback(() => {
    if (preview || loading) return undefined;
    void loadSets();
    if (slug) void loadDetail(slug);
    return undefined;
  }, [preview])); // eslint-disable-line react-hooks/exhaustive-deps
  const every = refreshEveryMs(set);
  useEffect(() => {
    if (!isFocused || preview) return;
    const timer = setInterval(() => {
      void loadSets();
      if (slug) void loadDetail(slug);
    }, every);
    return () => clearInterval(timer);
  }, [isFocused, preview, loadSets, loadDetail, slug, every]);

  // Keep the picked set card on screen, centered when possible.
  useEffect(() => {
    if (!slug) return;
    const index = sets.findIndex(entry => entry.slug === slug);
    if (index < 0) return;
    const x = SIDE + index * (SET_TAB_WIDTH + SET_TAB_GAP) - (width - SET_TAB_WIDTH) / 2;
    const timer = setTimeout(() => pickerRef.current?.scrollTo({ x: Math.max(0, x), animated: !reduced }), 60);
    return () => clearTimeout(timer);
  }, [slug, sets.length, width, reduced]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const celebrate = (reward: DexReward) => {
    playSfx('fx.reward', 0.9);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    setPopKey(key => key + 1);
    invalidateMenuRewardBadge();
    if (set) setReveal({ set, reward, key: Date.now() });
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
        setBook(current => ({ ...current, sets: current.sets.map(entry => entry.slug !== set.slug ? entry : {
          ...entry,
          reward: entry.reward.id === reward.id ? { ...entry.reward, status: 'claimed' } : entry.reward,
          steps: entry.steps.map(step => step.id === reward.id ? { ...step, status: 'claimed' } : step),
        }) }));
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
  }, [set, busy, preview, refreshPlayer, reloadAll]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const cell = Math.floor((width - SIDE * 2 - CELL_GAP * (COLUMNS - 1)) / COLUMNS);
  const status = set ? tabStatus(set) : null;
  const special = status && (status.live ? null : status);
  const daily = !!book.dailyRare?.available && !book.dailyRare.caughtToday;

  const header = (
    <View>
      <BookStrip found={book.found} total={book.total} dailyRare={daily} onDaily={goToMap} />
      <ScrollView ref={pickerRef} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.picker}>
        {sets.map(entry => <SetTab key={entry.slug} set={entry} selected={entry.slug === slug} onPress={chooseSet} />)}
      </ScrollView>
      {set && (
        <>
          <SetHeader set={set} focusBusy={busy === 'focus'} onOdds={() => { playSfx('ui.tap', 0.5); setOddsOpen(true); }}
            onFocus={set.status === 'active' || set.status === 'resting' ? () => void toggleFocus() : null} />
          <View style={styles.chips}>
            {special && <StatusChip text={special.text} icon={spawnIcon(special.text)} />}
            <SparesMeter spares={spares} onPress={() => { playSfx('ui.tap', 0.5); setSparesOpen(true); }} />
          </View>
          <RewardTrack set={set} busyId={busy} onClaim={reward => void claim(reward)}
            titleWorn={!!set.reward.title && player?.title === set.reward.title} titleBusy={busy === 'title'}
            onTitle={set.reward.title && !preview ? () => void toggleTitle() : null} popKey={popKey} />
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

      <View style={styles.page}>
        <Image source={WATER} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={[StyleSheet.absoluteFill, styles.dim]} />
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
            <Text style={styles.emptyTitle}>Catch your first find!</Text>
            <GameButton label="Open the map" icon="map" onPress={goToMap} />
          </View>
        ) : (
          <FlashList
            data={data}
            numColumns={COLUMNS}
            estimatedItemSize={cell + 46}
            keyExtractor={entry => (typeof entry === 'number' ? `ghost-${entry}` : String(entry.id))}
            ListHeaderComponent={header}
            extraData={spares}
            contentContainerStyle={{ paddingHorizontal: SIDE - CELL_GAP / 2, paddingBottom: BOTTOM_BAR_OVERHANG + 28 }}
            showsVerticalScrollIndicator={false}
            renderItem={({ item: entry }) => (
              <View style={{ paddingHorizontal: CELL_GAP / 2 }}>
                {typeof entry === 'number'
                  ? <TilePanel rarity={1} found={false} style={{ width: cell, height: cell, marginBottom: 46, opacity: 0.5 }} />
                  : <ItemTile item={entry} width={cell} swapReady={swapProgress(entry, spares).ready} onPress={openItem} />}
              </View>
            )}
          />
        )}
      </View>

      <ItemCard item={selectedItem} set={set} spares={spares} onClose={closeItem} error={error} onFind={goToMap}
        sharkName={player?.username}
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

      <SparesSheet visible={sparesOpen} items={items ?? []} onClose={() => setSparesOpen(false)} />
      <RewardReveal reveal={reveal} onClose={() => { playSfx('ui.tap', 0.5); setReveal(null); }} />
      <MilestonePickSheet view={picking && set ? pickView(picking, set.found) : null} busy={busy != null}
        onConfirm={itemId => { if (picking) void claim(picking, itemId); }} onClose={() => setPicking(null)} />
      <HomeHuntInfoSheet visible={oddsOpen} title="Drop odds" sections={oddsInfoSections(huntInfo)}
        loading={!huntInfo} error={huntInfoError} onRetry={retryHuntInfo} onClose={() => setOddsOpen(false)} />
    </Wrapper>
  );
}

/** One picture: two spare copies swap for a missing find. */
function SparesSheet({ visible, items, onClose }: { readonly visible: boolean; readonly items: readonly DexItem[]; readonly onClose: () => void }) {
  const spare = items.find(item => item.found && item.spares > 0) ?? items.find(item => item.found) ?? null;
  const missing = items.find(item => !item.found) ?? null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.sparesCard} accessibilityViewIsModal accessible accessibilityLabel="Spares swap for missing finds">
          <Text style={styles.sparesTitle}>Spares swap for new finds!</Text>
          <View style={styles.sparesRow}>
            {[0, 1].map(index => (
              <TilePanel key={index} rarity={spare?.rarity ?? 1} found style={styles.sparesTile}>
                {spare && <Image source={itemArt(spare)} style={styles.sparesArt} contentFit="contain" />}
              </TilePanel>
            ))}
            <GameIcon name="arrow" size={36} />
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
  page: { flex: 1, marginTop: -8, backgroundColor: '#0b7fd1' },
  dim: { backgroundColor: 'rgba(5,52,110,0.2)' },
  center: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, paddingHorizontal: 24, gap: 12, width: '100%' },
  emptyTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.white, textAlign: 'center' },
  picker: { paddingHorizontal: SIDE, paddingTop: 20, paddingBottom: 18 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: SIDE, marginTop: 12 },
  error: {
    fontFamily: 'Knockout', fontSize: 17, color: BRAND.navy, marginHorizontal: SIDE, marginTop: 10, padding: 10, borderRadius: 12,
    backgroundColor: BRAND.white, overflow: 'hidden',
  },
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
});
