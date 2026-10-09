/**
 * Pins (dustin-feedback-oct8/pins/DECISION.md). Replaces the old Pin Packs grid.
 *
 * Top: your lanyard (the flex) and three counts. Then three shelves:
 * - Mystery: boxes with odds on show, the gold chaser and its meter, open.
 * - Park Sets: cork boards of in-person pins (never traded), today's Pin of the Day.
 * - My Pins: every pin you own; tap to wear it on your lanyard.
 * Trade opens the trading board.
 *
 * A server without Pins v2 (404 on /pins/home) gets the old Pin Packs screen.
 */
import { useIsFocused } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, useSharedValue, withDelay, withRepeat, withTiming, Easing, cancelAnimation } from 'react-native-reanimated';
import { claimParkSet, getPinHome, openMysteryBoxes, pickWithPoints, saveLanyard, storefrontRegion } from '../../api/endpoints/pins';
import { warmPinImages } from '../pinTrading/pinImageCache';
import { PickSheet, PinsHelp } from './PinsSheets';
import Currency from '../../components/Topbar/Currency';
import Topbar, { BackButton } from '../../components/Topbar';
import TopbarColumn from '../../components/Topbar/TopbarColumn';
import TopbarText from '../../components/Topbar/TopbarText';
import { AuthContext } from '../../context/AuthProvider';
import { queueHaptic } from '../../gamekit/Haptics';
import * as RootNavigation from '../../RootNavigation';
import { BRAND, FONT, gameAlert, GameButton, GameIcon, OUTLINE, RADIUS, SharkLoader, SPACE } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { PageWash } from '../pinTrading/PinTradeParts';
import LegacyPinPacks from '../PinCollectionsScreen';
import BoxReveal, { preloadRevealAudio, type RevealPull } from './BoxReveal';
import HuntSheet from './HuntSheet';
import { Lanyard } from './Lanyard';
import { MysteryCard } from './MysteryCard';
import { boxTone, PIN_ART, PinTile } from './PinArt';
import { ParkSetCard } from './ParkSetCard';
import {
  coinsShort, deviceRegion, initialTab, myPins, newRequestId, PINS_COPY, toggleLanyard,
  type MysterySeries, type ParkSet, type PinHome, type PinRow, type Pull,
} from './pinsModel';

type Tab = 'mystery' | 'sets' | 'mine';
let devHuntOpened = false;

function TabButton({ label, icon, active, badge, onPress }: { label: string; icon: number; active: boolean; badge?: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.tab, active && styles.tabOn]} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={label}>
      <Image source={icon} style={{ width: 26, height: 26 }} contentFit="contain" />
      <Text maxFontSizeMultiplier={1.3} style={[styles.tabText, active && styles.tabTextOn]}>{label}</Text>
      {badge && <View style={styles.tabDot} />}
    </Pressable>
  );
}

export default function PinsScreen() {
  const { player, refreshPlayer } = useContext(AuthContext);
  const still = useUiReducedMotion();
  const focused = useIsFocused();
  const { width } = useWindowDimensions();
  const [home, setHome] = useState<PinHome | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error' | 'legacy'>('loading');
  const [tab, setTab] = useState<Tab | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{
    pulls: RevealPull[]; tone: 'blue' | 'coral'; variant?: 'box' | 'catch' | 'pick'; coins?: number; seriesId?: number;
    tag?: (p: RevealPull) => { text: string; tone: 'new' | 'trader' | 'gold' }; subtitle?: (p: RevealPull) => string | null;
  } | null>(null);
  const [fresh, setFresh] = useState<{ seriesId: number; ids: Set<number> } | null>(null);
  const [picking, setPicking] = useState<MysterySeries | null>(null);
  const [help, setHelp] = useState(false);
  const [visited, setVisited] = useState<Set<Tab>>(new Set());
  const [appActive, setAppActive] = useState(true);
  const region = useRef<string | null>(null);
  const [hunt, setHunt] = useState<ParkSet | null>(null);
  const [lanyardIds, setLanyardIds] = useState<number[]>([]);
  const pending = useRef<Record<number, string>>({});
  const pendingSeries = useRef<MysterySeries | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const shine = useSharedValue(0);
  const coins = player?.coins ?? 0;

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setState(s => (s === 'ready' ? s : 'loading'));
    try {
      // Paid boxes follow the App Store storefront country (else the device region).
      region.current ??= (await storefrontRegion()) ?? deviceRegion();
      const h = await getPinHome(region.current);
      setHome(h);
      setLanyardIds(h.lanyard.map(p => p.item_id));
      // Dev capture only: EXPO_PUBLIC_PINS_TAB opens a shelf, EXPO_PUBLIC_PINS_HUNT opens today's hunt.
      const devTab = __DEV__ ? (process.env.EXPO_PUBLIC_PINS_TAB as Tab | undefined) : undefined;
      setTab(t => t ?? devTab ?? initialTab(h));
      if (__DEV__ && process.env.EXPO_PUBLIC_PINS_HUNT === '1' && !devHuntOpened) {
        devHuntOpened = true;
        const here = h.pin_days?.find(d => d.here && d.status === 'hunt');
        const set = here && h.park_sets.find(st => st.park_id === here.park_id);
        if (set) setTimeout(() => setHunt(set), 800);
      }
      setState('ready');
    } catch (e: unknown) {
      const status = (e as { response?: { status?: number } })?.response?.status;
      setState(status === 404 ? 'legacy' : (quiet ? 'ready' : 'error'));
    }
  }, []);

  useEffect(() => { void load(); preloadRevealAudio(); }, [load]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', s => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);
  // One "visible" flag feeds every idle loop: focused, app open, no reveal or sheet on top.
  const visible = focused && appActive && !reveal && !hunt && !picking && !help;

  // One shine sweep across the visible pins every ~7 s while the page is up (UI thread, nothing redraws at rest).
  useEffect(() => {
    if (still || !visible || state !== 'ready') { cancelAnimation(shine); return; }
    shine.value = 0;
    shine.value = withRepeat(withDelay(5200, withTiming(1, { duration: 1800, easing: Easing.inOut(Easing.quad) })), -1, false);
    return () => cancelAnimation(shine);
  }, [still, visible, state, shine]);

  useEffect(() => { if (tab) setVisited(v => (v.has(tab) ? v : new Set(v).add(tab))); }, [tab]);

  const open = useCallback(async (series: MysterySeries, count: number, pay: 'coins' | 'free') => {
    if (busy) return;
    if (pay === 'coins' && coinsShort(series, count, coins) > 0) return; // the card shows the top-up
    const key = `${series.id}:${count}:${pay}`;
    // A retried tap after a failure reuses its id, so it can never charge twice.
    const requestId = pending.current[series.id] ?? newRequestId();
    pending.current[series.id] = requestId;
    setBusy(key);
    queueHaptic('tapLight', 1);
    try {
      const r = await openMysteryBoxes(series.id, { count, pay, request_id: requestId, region: region.current });
      delete pending.current[series.id];
      // Decode the pins at reveal size before the box opens, so the flip never shows a blank.
      await Promise.race([warmPinImages(r.pulls.map(p => p.icon_url ?? undefined), 210), new Promise(res => setTimeout(res, 700))]);
      const order = new Map(series.pins.filter(p => !p.is_chaser).map((p, i) => [p.item_id, i + 1]));
      const regularCount = order.size;
      setReveal({
        pulls: r.pulls, tone: boxTone(series.theme_color), seriesId: series.id,
        subtitle: p => (p.is_chaser ? series.name : `${series.name} \u00b7 ${order.get(p.item_id) ?? '?'} of ${regularCount}`),
      });
      // The page updates when the reveal closes (pins land in their slots then).
      pendingSeries.current = r.series;
      void refreshPlayer().catch(() => undefined);
    } catch (e: unknown) {
      const data = (e as { response?: { status?: number; data?: { code?: string; message?: string; need?: number; have?: number } } })?.response;
      if (data?.status && data.status < 500) delete pending.current[series.id];
      if (data?.data?.code === 'not_enough_currency') void refreshPlayer().catch(() => undefined);
      else gameAlert('That box didn’t open', data?.data?.message ?? 'Check your internet and try again. Your coins are safe.');
    } finally { setBusy(null); }
  }, [busy, coins, refreshPlayer]);

  const claim = useCallback(async (set: ParkSet) => {
    if (busy) return;
    setBusy(`set:${set.id}`);
    try {
      const r = await claimParkSet(set.id);
      if (r.claimed) {
        const c = set.reward.completer;
        if (c) {
          setReveal({
            variant: 'catch', tone: 'blue',
            pulls: [{ id: c.item_id, item_id: c.item_id, pin_id: 0, name: c.name, icon_url: c.icon_url, is_chaser: false, by_pity: false, serial: null, duplicate: false, rare: true }],
            tag: () => ({ text: `+${r.coins} coins${r.boxes ? ` +${r.boxes} box` : ''}`, tone: 'gold' }),
            subtitle: () => `${set.name} set done!`,
          });
        } else {
          queueHaptic('success', 2);
          gameAlert(`${set.name} done!`, `+${r.coins} coins${r.boxes ? ` and ${r.boxes} free box` : ''}.`);
        }
      }
      void refreshPlayer().catch(() => undefined);
      await load(true);
    } catch {
      gameAlert('Not yet', 'Check your internet and try again.');
    } finally { setBusy(null); }
  }, [busy, load, refreshPlayer]);

  const pick = useCallback(async (series: MysterySeries, pin: PinRow) => {
    if (busy) return;
    setBusy(`pick:${series.id}`);
    try {
      const r = await pickWithPoints(series.id, pin.item_id, newRequestId());
      setPicking(null);
      if (r.picked) {
        pendingSeries.current = r.series;
        setReveal({
          variant: 'pick', tone: boxTone(series.theme_color), seriesId: series.id,
          pulls: [{ id: pin.item_id, item_id: pin.item_id, pin_id: 0, name: pin.name, icon_url: pin.icon_url, is_chaser: false, by_pity: false, serial: null, duplicate: false }],
          tag: () => ({ text: 'Picked with extras!', tone: 'new' }), subtitle: () => series.name,
        });
      }
    } catch {
      gameAlert('Not yet', 'Check your internet and try again.');
    } finally { setBusy(null); }
  }, [busy]);

  const closeReveal = useCallback((shown: readonly RevealPull[]) => {
    const r = reveal;
    setReveal(null);
    const next = pendingSeries.current;
    pendingSeries.current = null;
    if (next && r?.seriesId) {
      // Pins land in their slots: the series updates and the new ones pop in with a gold ring.
      const before = home?.mystery.find(s => s.id === next.id);
      setHome(h => h && ({ ...h, mystery: h.mystery.map(s => (s.id === next.id ? next : s)) }));
      // Finishing the series: its Completer pin gets its own moment.
      if (next.completer?.owned && before?.completer && !before.completer.owned) {
        const c = next.completer;
        setTimeout(() => setReveal({
          variant: 'pick', tone: boxTone(next.theme_color),
          pulls: [{ id: c.item_id, item_id: c.item_id, pin_id: 0, name: c.name, icon_url: c.icon_url, is_chaser: false, by_pity: false, serial: null, duplicate: false, rare: true }],
          tag: () => ({ text: 'Series done!', tone: 'gold' }), subtitle: () => next.name,
        }), 900);
      }
      const ids = new Set(shown.filter(p => !p.duplicate).map(p => p.item_id));
      setFresh({ seriesId: r.seriesId, ids });
      setTimeout(() => setFresh(f => (f && f.ids === ids ? null : f)), 2600);
    } else if (r?.variant === 'catch') {
      void load(true);
    }
  }, [reveal, load, home]);

  const onPin = useCallback((_set: ParkSet, _pin: PinRow) => { queueHaptic('tapLight', 1); }, []);

  const toggleWear = useCallback((pin: PinRow) => {
    const max = home?.lanyard_max ?? 6;
    const next = toggleLanyard(lanyardIds, pin.item_id, max);
    if (next.full) { queueHaptic('failBuzz', 1); gameAlert('Lanyard is full', `You can wear ${max}. Tap a pin on the lanyard to take it off.`); return; }
    queueHaptic('tickSelection', 1);
    setLanyardIds(next.ids);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void saveLanyard(next.ids).then(l => setHome(h => h && ({ ...h, lanyard: l }))).catch(() => undefined);
    }, 600);
  }, [home?.lanyard_max, lanyardIds]);

  const owned = useMemo(() => (home ? myPins(home) : []), [home]);
  const byId = useMemo(() => new Map(owned.map(p => [p.item_id, p])), [owned]);
  const lanyardPins = useMemo(() => lanyardIds.map(id => byId.get(id)).filter((p): p is PinRow => !!p).map(p => ({
    item_id: p.item_id, name: p.name, icon_url: p.icon_url, kind: p.kind, is_chaser: !!p.is_chaser, tradable: p.tradable, serial: p.serial,
  })), [lanyardIds, byId]);
  /** "Wear it" from a reveal: saves now; a full lanyard swaps out its last pin. True once saved. */
  const wear = useCallback(async (itemId: number): Promise<boolean> => {
    if (lanyardIds.includes(itemId)) return true;
    const max = home?.lanyard_max ?? 6;
    const ids = lanyardIds.length >= max ? [...lanyardIds.slice(0, max - 1), itemId] : [...lanyardIds, itemId];
    try {
      const l = await saveLanyard(ids);
      setLanyardIds(l.map(p => p.item_id));
      setHome(h => h && ({ ...h, lanyard: l }));
      return l.some(p => p.item_id === itemId);
    } catch { return false; }
  }, [lanyardIds, home?.lanyard_max]);
  const dayFor = useCallback((set: ParkSet) => home?.pin_days?.find(d => d.park_id === set.park_id), [home?.pin_days]);

  if (state === 'legacy') return <LegacyPinPacks />;

  const freeWaiting = !!home?.mystery.some(s => s.free_now);
  const claimWaiting = !!home?.park_sets.some(s => s.complete && !s.claimed);
  const huntToday = !!home?.pin_days?.some(d => d.status === 'hunt' && d.here);

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>{PINS_COPY.title}</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Currency count={coins} name="Coins" />
            <Pressable onPress={() => setHelp(true)} hitSlop={8} accessibilityRole="button" accessibilityLabel="How pins work"
              style={styles.helpBtn}><GameIcon name="info" size={26} /></Pressable>
          </View>
        </TopbarColumn>
      </Topbar>
      <View style={{ flex: 1, marginTop: -8 }}>
        <PageWash />
        {state !== 'ready' || !home ? (
          <View style={styles.center}>
            <SharkLoader state={state === 'error' ? 'error' : 'loading'} onRetry={() => void load()} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.scroll}
            refreshControl={<RefreshControl refreshing={refreshing} tintColor={BRAND.white}
              onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} />}>
            <Animated.View entering={still ? undefined : FadeIn.duration(220)} style={styles.hero}>
              <View style={styles.heroTop}>
                <Text maxFontSizeMultiplier={1.3} style={styles.heroTitle}>{PINS_COPY.lanyard} <Text style={styles.heroCount}>{home.counts.pins} pins</Text></Text>
                <Pressable onPress={() => { queueHaptic('tapLight', 1); RootNavigation.navigate('PinSwaps'); }} style={({ pressed }) => [styles.tradePill, pressed && { transform: [{ scale: 0.96 }] }]}
                  accessibilityRole="button" accessibilityLabel="Trade pins on the board" hitSlop={8}>
                  <Image source={PIN_ART.trade} style={{ width: 26, height: 26 }} contentFit="contain" />
                  <Text maxFontSizeMultiplier={1.1} style={styles.tradeText}>{PINS_COPY.trade}</Text>
                </Pressable>
              </View>
              <Lanyard pins={lanyardPins} width={width - SPACE.lg * 2} height={176} showEmpty still={still} active={visible}
                shine={shine} onPressSlot={(_, pin) => {
                  // On My Pins a tap takes a pin off; anywhere else it opens My Pins to choose.
                  if (tab === 'mine' && pin) toggleWear({ item_id: pin.item_id } as PinRow); else setTab('mine');
                }} />
              <View style={styles.counts}>
                <View style={styles.countChip} accessible accessibilityLabel={`${home.counts.sets_done} of ${home.counts.sets} park sets done`}>
                  <Image source={PIN_ART.seal} style={{ width: 22, height: 22 }} contentFit="contain" />
                  <Text maxFontSizeMultiplier={1.1} style={styles.countText}>{home.counts.sets_done}/{home.counts.sets}</Text>
                </View>
                <View style={styles.countChip} accessible accessibilityLabel={`${home.counts.chasers} chasers`}>
                  <Image source={PIN_ART.chaser} style={{ width: 22, height: 22 }} contentFit="contain" />
                  <Text maxFontSizeMultiplier={1.1} style={styles.countText}>{home.counts.chasers}</Text>
                </View>
                <View style={styles.countChip} accessible accessibilityLabel={`${home.counts.traders} traders to trade`}>
                  <Image source={PIN_ART.trade} style={{ width: 22, height: 22 }} contentFit="contain" />
                  <Text maxFontSizeMultiplier={1.1} style={styles.countText}>{home.counts.traders}</Text>
                </View>
              </View>
            </Animated.View>

            <View style={styles.tabs} accessibilityRole="tablist">
              <TabButton label={PINS_COPY.tabMystery} icon={require('../../../assets/images/pins/box-blue-closed.webp')} active={tab === 'mystery'} badge={freeWaiting} onPress={() => setTab('mystery')} />
              <TabButton label={PINS_COPY.tabSets} icon={PIN_ART.seal} active={tab === 'sets'} badge={claimWaiting || huntToday} onPress={() => setTab('sets')} />
              <TabButton label={PINS_COPY.tabMine} icon={require('../../../assets/images/pins/box-blue-lid.webp')} active={tab === 'mine'} onPress={() => setTab('mine')} />
            </View>

            {/* Tabs stay mounted once visited (no rebuild on every switch). */}
            {visited.has('mystery') && (
              <View style={[styles.list, tab !== 'mystery' && styles.hidden]}>
                {home.mystery.map(s => (
                  <MysteryCard key={s.id} series={s} coins={coins} busy={!!busy && (busy.startsWith(`${s.id}:`) || busy === `pick:${s.id}`)}
                    active={visible && tab === 'mystery'} still={still} shine={tab === 'mystery' ? shine : undefined}
                    fresh={fresh?.seriesId === s.id ? fresh.ids : undefined} onOpen={open} onPick={setPicking} />
                ))}
              </View>
            )}

            {visited.has('sets') && (
              <View style={[styles.list, tab !== 'sets' && styles.hidden]}>
                {home.park_sets.map(s => (
                  <ParkSetCard key={s.id} set={s} today={dayFor(s)} busy={busy === `set:${s.id}`} still={still || !visible || tab !== 'sets'} shine={tab === 'sets' ? shine : undefined}
                    onClaim={claim} onPin={onPin} onHunt={setHunt} />
                ))}
              </View>
            )}

            {visited.has('mine') && (
              <View style={[styles.mine, tab !== 'mine' && styles.hidden]}>
                <Text maxFontSizeMultiplier={1.3} style={styles.wearHint}>Tap a pin to wear it</Text>
                <View style={styles.legend}>
                  <View style={styles.legendItem}><Image source={PIN_ART.trade} style={styles.legendIcon} contentFit="contain" /><Text maxFontSizeMultiplier={1.1} style={styles.legendText}>Can trade</Text></View>
                  <View style={styles.legendItem}><Image source={PIN_ART.seal} style={styles.legendIcon} contentFit="contain" /><Text maxFontSizeMultiplier={1.1} style={styles.legendText}>Park only</Text></View>
                  <Text maxFontSizeMultiplier={1.1} style={styles.legendWear}>Wearing {lanyardIds.length}/{home.lanyard_max}</Text>
                </View>
                <View style={styles.grid}>
                  {owned.map((p, i) => {
                    const on = lanyardIds.includes(p.item_id);
                    const cellW = Math.floor((width - SPACE.lg * 2 - SPACE.md * 2 - OUTLINE.thick * 2 - 6 * 3) / 4);
                    const size = cellW - 22;
                    return (
                      <Pressable key={p.item_id} onPress={() => toggleWear(p)} style={[styles.cell, { width: cellW }, on && styles.cellOn]}
                        accessibilityRole="button" accessibilityState={{ selected: on }}
                        accessibilityLabel={`${p.name}${p.is_chaser ? ', chaser' : ''}${p.tradable ? ', can trade' : ', park only'}${on ? ', on your lanyard' : ''}`}>
                        <PinTile uri={p.icon_thumb_url ?? p.icon_url} size={size} owned kind={p.kind} tradable={p.tradable} chaser={p.is_chaser} spares={p.spares}
                          serial={p.serial} tilt={((i * 23) % 9) - 4} flat />
                        {on && <View style={styles.onCheck}><GameIcon name="check" size={16} /></View>}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            )}
          </ScrollView>
        )}
      </View>
      {reveal && (
        <BoxReveal pulls={reveal.pulls} tone={reveal.tone} still={still} variant={reveal.variant}
          tagFor={reveal.tag} subtitleFor={reveal.subtitle}
          canWear={p => p.is_chaser || reveal.variant === 'catch' || !!p.rare}
          onWear={p => wear(p.item_id)}
          onDone={closeReveal} />
      )}
      {hunt && (
        <HuntSheet set={hunt} still={still} onClose={() => setHunt(null)} onCaught={r => {
          setHunt(null);
          const day = r.day ? new Date(`${r.day}T12:00:00`).toLocaleString('en-US', { month: 'short', day: 'numeric' }) : '';
          setReveal({
            variant: 'catch', tone: 'blue', coins: r.coins,
            pulls: [{ id: r.pin.item_id, item_id: r.pin.item_id, pin_id: 0, name: r.pin.name, icon_url: r.pin.icon_url,
              is_chaser: false, by_pity: false, serial: null, duplicate: !r.new, rare: r.pin.rarity === 'rare' }],
            tag: p => (p.duplicate ? { text: `+${r.coins} coins`, tone: 'trader' } : p.rare ? { text: 'RARE park pin!', tone: 'gold' } : { text: 'Park pin!', tone: 'new' }),
            subtitle: () => [r.park_name ?? hunt.park_name, day, r.catch_number ? `#${r.catch_number} to find it` : null].filter(Boolean).join(' \u00b7 '),
          });
          void refreshPlayer().catch(() => undefined);
        }} />
      )}
      {picking && (
        <PickSheet series={picking} busy={busy === `pick:${picking.id}`} onClose={() => setPicking(null)} onPick={p => void pick(picking, p)} />
      )}
      {help && <PinsHelp onClose={() => setHelp(false)} />}
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hidden: { display: 'none' },
  helpBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: BRAND.white, borderWidth: 3, borderColor: BRAND.blue, alignItems: 'center', justifyContent: 'center' },
  wearHint: { fontFamily: FONT.display, fontSize: 17, color: BRAND.navy, textAlign: 'center', paddingTop: 2 },
  scroll: { paddingHorizontal: SPACE.lg, paddingTop: SPACE.md, paddingBottom: 48, gap: SPACE.md },
  hero: { backgroundColor: 'rgba(5,52,110,0.32)', borderRadius: RADIUS.lg, borderWidth: 2, borderColor: 'rgba(255,255,255,0.25)', paddingTop: SPACE.sm, paddingBottom: SPACE.md, overflow: 'hidden' },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: SPACE.md },
  heroCount: { fontFamily: FONT.body, fontSize: 17, color: '#e2f6ff', textShadowRadius: 0 },
  tradePill: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: BRAND.gold, borderColor: BRAND.navy, borderWidth: 3,
    borderRadius: 999, paddingLeft: 6, paddingRight: 14, paddingVertical: 4, minHeight: 44,
    shadowColor: BRAND.navy, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.35, shadowRadius: 0,
  },
  tradeText: { fontFamily: FONT.display, fontSize: 19, color: BRAND.navy, paddingTop: 3 },
  heroTitle: { fontFamily: FONT.display, fontSize: 24, color: BRAND.white, paddingTop: 3, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  counts: { flexDirection: 'row', justifyContent: 'center', gap: SPACE.sm, marginTop: -SPACE.sm },
  // Read-only counts: no button look (no outline), just icon + number.
  countChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, paddingVertical: 2 },
  countText: { fontFamily: FONT.display, fontSize: 18, color: BRAND.white, paddingTop: 2, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  tabs: { flexDirection: 'row', gap: SPACE.sm },
  tab: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 48,
    backgroundColor: 'rgba(5,52,110,0.35)', borderRadius: RADIUS.md, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)',
  },
  tabOn: { backgroundColor: BRAND.cream, borderColor: BRAND.navy, borderWidth: OUTLINE.thick },
  tabText: { fontFamily: FONT.display, fontSize: 16, color: BRAND.white, paddingTop: 3 },
  tabTextOn: { color: BRAND.navy },
  tabDot: { position: 'absolute', top: -5, right: -3, width: 16, height: 16, borderRadius: 8, backgroundColor: BRAND.red, borderWidth: 2, borderColor: BRAND.white },
  list: { gap: SPACE.lg },
  mine: { backgroundColor: BRAND.cream, borderRadius: RADIUS.lg, borderWidth: OUTLINE.thick, borderColor: BRAND.navy, padding: SPACE.md, gap: SPACE.md },
  legend: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  legendIcon: { width: 22, height: 22 },
  legendText: { fontFamily: FONT.body, fontSize: 17, color: BRAND.navy },
  legendWear: { marginLeft: 'auto', fontFamily: FONT.display, fontSize: 15, color: BRAND.navySoft, paddingTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'flex-start' },
  cell: { padding: 8, borderRadius: RADIUS.md, borderWidth: 3, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  cellOn: { borderColor: BRAND.gold, backgroundColor: '#fff1c2' },
  onCheck: { position: 'absolute', top: 2, right: 2, backgroundColor: BRAND.green, borderRadius: 12, borderWidth: 2, borderColor: BRAND.white, padding: 1 },
});
