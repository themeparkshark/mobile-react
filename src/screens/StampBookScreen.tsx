/**
 * Stamp Book v3: a passport book in a sunlit lagoon (the Standings ocean art).
 *
 * At a glance, top to bottom:
 *  - The cover: a ring with stamps earned, the title you wear (tap: Titles),
 *    and, when rewards wait, one big gold "Claim n!" that starts the claim chain.
 *  - Almost there: the 3 stamps closest to done, each with its ring and "14/25".
 *  - Bookmark tabs with counts and a red dot where a reward waits.
 *  - One paper page per section. Owned stamps are white sticker cards pressed
 *    onto the page; stamps not earned yet wait in recessed dashed slots with
 *    their ghost art, a progress ring and "3/5". Title stamps wear a crown.
 * Tap a stamp for the big card. The Titles list says how a stamp becomes a
 * title (earn, claim, wear) and wears or removes one in a tap.
 *
 * Performance: one shared shine clock (BookFx), tiles never re-render on card
 * open/close or scroll, stamp objects keep identity across refetches, the
 * focus refetch is throttled to 30 s, and tile thumbs are prefetched.
 */
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { InteractionManager, Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useIsFocused, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, type SharedValue } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import * as RootNavigation from '../RootNavigation';
import { claimStampReward, equipStampTitle, getStamps, type StampsResponse } from '../api/endpoints/me/stamps';
import { AuthContext } from '../context/AuthProvider';
import { haptic } from '../gamekit/Haptics';
import { playSfx } from '../gamekit/SFX';
import GameIcon from '../ui/GameIcon';
import type { GameIconName } from '../ui/iconNames';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import StampTile, { INK, MUTED_INK, PAPER, SLOT_EDGE } from './stampbook/StampTile';
import StampCard, { type ClaimResult, type Wallet } from './stampbook/StampCard';
import StampArt from './stampbook/StampArt';
import TitlesSheet from './stampbook/TitlesSheet';
import ClaimAll from './stampbook/ClaimAll';
import { loadBookCache, memoryBook, saveBookCache } from './stampbook/cache';
import { BookFxProvider, useBookClocks, useBookFx } from './stampbook/BookFx';
import { stampRarity } from './stampbook/rarity';
import { Confetti } from './stampbook/SlamFx';
import { prefetchList } from './stampbook/art';
import { loadCelebrated, loadSeen, saveCelebrated, saveSeen } from './stampbook/seen';
import { takeStampsDirty } from './stampbook/dirty';
import {
  almostThereList, rarestOwned, bookTotals, buildBook, claimQueue, hasShine, progressLabel, remainingLine, requirement, ring, stampIndex, titleCounts, titleEntries,
  type BookSection, type BookStamp, type GoTarget, type TitleEntry,
} from './stampbook/model';

const GAP = 9;
const SIDE = 12;
const PAGE_PAD = 12;
const PAGE_BORDER = 3;
/** The book board's side inset around the pages. */
const BOARD_INSET = 6;
/** Page margin inside the board. */
const PAGE_SIDE = 8;
const REFETCH_MS = 30_000;
/** The floating compass nav covers about this much of the bottom. */
const NAV_COVER = 150;
const SECTION_ICON: Record<string, GameIconName> = {
  parks: 'map', hunt: 'pin', rides: 'coin', friends: 'member', streaks: 'streak', milestones: 'trophy', special: 'star',
};
const BACKGROUND = require('../../assets/images/screens/leaderboard/standings-bg.png');
const SHARK = require('../../assets/images/howto/shark-happy.webp');
/** Sticky bookmark band height: a tab scroll lands the page just under it. */
const TABS_H = 64;

export default function StampBookScreen() {
  const previewMode = __DEV__ && process.env.EXPO_PUBLIC_STAMP_BOOK_PREVIEW === '1';
  const { player, refreshPlayer } = useContext(AuthContext);
  const route = useRoute();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const reducedMotion = useUiReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const chipScroller = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, { x: number; w: number }>>({});

  // The last book draws on the first frame (memory, then device cache); the network refresh lands behind it.
  const [response, setResponse] = useState<StampsResponse | null>(() => (previewMode ? null : memoryBook(player?.id ?? null)));
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>(() => (response ? 'ready' : 'loading'));
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<BookStamp | null>(null);
  const [fresh, setFresh] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [titlesOpen, setTitlesOpen] = useState(() => !!(route.params as { titles?: boolean } | undefined)?.titles);
  const [titleBusy, setTitleBusy] = useState<string | null>(null);
  const [titleMessage, setTitleMessage] = useState<string | null>(null);
  // Dev preview only: the worn title lives here (there is no signed-in player).
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  /** The worn title as the player just set it (optimistic); null once the server agrees. */
  const [titleOverride, setTitleOverride] = useState<{ title: string | null } | null>(null);
  const [claimAllOpen, setClaimAllOpen] = useState<readonly BookStamp[] | null>(null);
  const sectionY = useRef<Record<string, number>>({});
  // First frame: the cover, Almost there and the first two pages; the rest mount once the push has settled.
  const [allPages, setAllPages] = useState(false);
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => setAllPages(true));
    return () => task.cancel();
  }, []);
  // Dev overlay only: milliseconds from mount to the first real page on screen.
  const mountedAt = useRef(Date.now());
  const boardY = useRef(0);
  const [boardTopState, setBoardTopState] = useState(0);
  // Seen stamps live in a ref so opening a card never changes `open` (no tile re-render on the slam frame).
  const seenRef = useRef<Set<string> | null>(null);
  const [seenVersion, setSeenVersion] = useState(0);
  const claimingRef = useRef(false);
  const forceNext = useRef(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const lastFetch = useRef(0);
  const prevIndex = useRef<Map<number, BookStamp>>(new Map());
  const pendingPatch = useRef<number[]>([]);


  const sections = useMemo(() => {
    if (!response) return [];
    const book = buildBook(response, prevIndex.current);
    prevIndex.current = stampIndex(book);
    return book;
  }, [response]);
  const totals = useMemo(() => bookTotals(sections), [sections]);
  const shinyOwned = useMemo(() => sections.some(s => s.stamps.some(hasShine)), [sections]);
  // Clocks rest when nothing uses them: pulse only with a reward waiting, shine only with a rare-or-better stamp owned.
  const fx = useBookClocks(focused && !selected && !titlesOpen && !claimAllOpen, reducedMotion, { pulseOn: totals.toClaim > 0, shineOn: shinyOwned, pulseWhenIdle: totals.toClaim > 0 });
  const queue = useMemo(() => claimQueue(sections), [sections]);
  const almost = useMemo(() => almostThereList(sections, 3), [sections]);
  const rarest = useMemo(() => rarestOwned(sections), [sections]);
  const accentFor = useCallback((key: string) => sections.find(s => s.key === key)?.color ?? '#2F6BFF', [sections]);
  const wornTitle = (titleOverride ? titleOverride.title
    : previewMode ? previewTitle ?? response?.equipped_title ?? null : player?.title ?? response?.equipped_title ?? null) || null;
  const titles = useMemo(() => titleEntries(sections, response?.unlocked_titles, wornTitle), [sections, response?.unlocked_titles, wornTitle]);
  const titleCount = titleCounts(titles);

  // Opened again with { titles: true } (the profile's "More titles"): show the Titles list.
  const wantTitles = !!(route.params as { titles?: boolean } | undefined)?.titles;
  useEffect(() => { if (wantTitles) setTitlesOpen(true); }, [wantTitles, route.params]);

  useEffect(() => { loadSeen().then(set => { seenRef.current = set; setSeenVersion(v => v + 1); }); }, []);
  // Cold app start: the device copy of the last book, if the network has not answered first.
  useEffect(() => {
    if (previewMode || response) return;
    void loadBookCache(player?.id ?? null).then(cached => {
      if (!cached) return;
      setResponse(current => current ?? cached);
      setStatus(current => (current === 'loading' ? 'ready' : current));
    });
    // Once, on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback((force: boolean) => {
    if (previewMode) {
      const { PREVIEW_BOOK } = require('./stampbook/preview');
      setResponse(current => current ?? PREVIEW_BOOK);
      setStatus('ready');
      return;
    }
    // A catch or a park change since the last load skips the throttle once.
    if (takeStampsDirty()) force = true;
    if (!force && Date.now() - lastFetch.current < REFETCH_MS) return;
    lastFetch.current = Date.now();
    setStatus(current => (current === 'ready' ? current : 'loading'));
    getStamps()
      .then(data => {
        setResponse(data);
        setStatus('ready');
        saveBookCache(player?.id ?? null, data);
        const urls = prefetchList(Object.values(data.stamps).flat().map(s => ({
          slug: s.slug, earned: s.is_earned, iconUrl: s.icon_url ?? null, thumbUrl: s.icon_thumb_url ?? s.icon_url ?? null,
          lockedUrl: s.locked_icon_url ?? null, lockedThumbUrl: s.locked_thumb_url ?? null,
        })));
        if (urls.length) Image.prefetch(urls, 'disk').catch(() => undefined);
        // The big art for every stamp that will slam (claimable or unseen) is fetched before it is opened.
        const seen = seenRef.current;
        // Until the seen set has loaded every earned stamp would count as unseen: only prefetch claimables then.
        const big = Object.values(data.stamps).flat()
          .filter(s => s.is_earned && s.icon_url && (!s.reward_claimed || (!!seen && !seen.has(String(s.id)))))
          .map(s => s.icon_url as string);
        if (big.length) Image.prefetch(big, 'disk').catch(() => undefined);
      })
      .catch(() => { lastFetch.current = 0; setStatus(current => (current === 'ready' ? current : 'error')); });
  }, [previewMode, player?.id]);

  useFocusEffect(useCallback(() => {
    const force = forceNext.current;
    forceNext.current = false;
    load(force);
  }, [load]));

  // Dev-only visual checks: open a section, the Titles list or a stamp card straight away.
  const devHooks = __DEV__ && (previewMode || process.env.EXPO_PUBLIC_STAMP_BOOK_LIVE === '1');
  useEffect(() => {
    if (!devHooks || status !== 'ready') return;
    const tab = process.env.EXPO_PUBLIC_STAMP_BOOK_TAB;
    if (tab) setFilter(tab);
    if (process.env.EXPO_PUBLIC_STAMP_BOOK_TITLES === '1') setTitlesOpen(true);
    // Scroll the book down by N points, for capturing tiles below the fold.
    const scrollY = Number(process.env.EXPO_PUBLIC_STAMP_BOOK_SCROLL ?? 0);
    if (scrollY > 0) setTimeout(() => scroller.current?.scrollTo({ y: scrollY, animated: false }), 1200);
    const slug = process.env.EXPO_PUBLIC_STAMP_BOOK_OPEN;
    const found = slug ? sections.flatMap(s => s.stamps).find(s => s.slug === slug) : undefined;
    if (found) { const t = setTimeout(() => { setFresh(true); setSelected(found); }, 900); return () => clearTimeout(t); }
    // Preview should only run once on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devHooks, status]);


  // Section completion moment: once per section per device, after the push settles; the book scrolls the
  // finished page into view first so the seal slam, thunk and haptic happen where the kid is looking.
  useEffect(() => {
    if (status !== 'ready' || !sections.length || !allPages) return;
    let active = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    loadCelebrated().then(done => {
      if (!active) return;
      const complete = sections.find(s => s.total > 0 && s.earned >= s.total && !s.stamps.some(x => x.claimable) && !done.has(s.key));
      if (!complete) return;
      done.add(complete.key);
      saveCelebrated(done);
      const y = sectionY.current[complete.key];
      if (typeof y === 'number') scroller.current?.scrollTo({ y: Math.max(0, y - TABS_H - 4), animated: !reducedMotion });
      timers.push(setTimeout(() => {
        if (!active) return;
        setCelebrate(complete.key);
        playSfx('fx.reward');
        haptic('success');
        timers.push(setTimeout(() => active && setCelebrate(null), 1600));
      }, reducedMotion ? 0 : 450));
    });
    return () => { active = false; timers.forEach(clearTimeout); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, sections, allPages]);

  /** Applies claims made while the card was open, once it closes (keeps the slam frame clean). */
  const flushPatches = useCallback(() => {
    const ids = pendingPatch.current;
    if (!ids.length) return;
    pendingPatch.current = [];
    setResponse(current => {
      if (!current) return current;
      const all = Object.values(current.stamps).flat();
      // A claimed title stamp unlocks its title (the server writes player_stamp_titles in the same claim).
      const unlocked = [...(current.unlocked_titles ?? [])];
      for (const id of ids) {
        const s = all.find(x => x.id === id);
        if (s?.rewards?.title && !unlocked.some(u => u.stamp_id === id)) unlocked.push({ stamp_id: id, title: s.rewards.title });
      }
      const next = {
        ...current,
        unlocked_titles: unlocked,
        stamps: Object.fromEntries(Object.entries(current.stamps).map(([key, list]) =>
          [key, list.map(s => (ids.includes(s.id) ? { ...s, reward_claimed: true } : s))])),
      };
      if (!previewMode) saveBookCache(player?.id ?? null, next);
      return next;
    });
  }, [previewMode, player?.id]);

  /** Stamps opened while the card was up; their NEW tags clear when it closes, not on the slam frame. */
  const openedRef = useRef<number[]>([]);
  const flushSeen = useCallback(() => {
    const set = seenRef.current;
    const ids = openedRef.current;
    openedRef.current = [];
    if (!set || !ids.length) return;
    ids.forEach(id => set.add(String(id)));
    saveSeen(set);
    setSeenVersion(v => v + 1);
  }, []);

  const open = useCallback((stamp: BookStamp) => {
    const set = seenRef.current;
    setMessage(null);
    setFresh(stamp.earned && !!set && !set.has(String(stamp.id)) && !openedRef.current.includes(stamp.id));
    setSelected(stamp);
    if (stamp.earned) openedRef.current.push(stamp.id);
  }, []);

  // A pending hand-off never opens a card after the book closed it (or unmounted).
  const handoffTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handoffCancelled = useRef(false);
  useEffect(() => () => { handoffCancelled.current = true; if (handoffTimer.current) clearTimeout(handoffTimer.current); }, []);

  const close = useCallback(() => {
    handoffCancelled.current = true;
    if (handoffTimer.current) clearTimeout(handoffTimer.current);
    playSfx('ui.modalClose', 0.5);
    setSelected(null);
    flushPatches();
    flushSeen();
  }, [flushPatches, flushSeen]);

  const closeRef = useRef<() => void>(() => undefined);
  closeRef.current = close;
  const pickRef = useRef<(k: string) => void>(() => undefined);
  const openClaimRef = useRef<() => void>(() => undefined);

  const nextClaim = useMemo(() => {
    const waiting = queue.filter(s => !pendingPatch.current.includes(s.id));
    return waiting.find(s => s.id !== selected?.id) ?? null;
    // pendingPatch is a ref; selected changes on every hand-off, which recomputes this.
  }, [queue, selected]);

  /** Opens the next claimable stamp once its thumb is in memory (or after 350 ms), so the hand-off is never an empty stage. */
  const openNextClaim = useCallback(() => {
    const waiting = queue.filter(s => !pendingPatch.current.includes(s.id));
    const target = waiting.find(s => s.id !== selected?.id) ?? waiting[0];
    if (!target) return;
    const thumb = target.thumbUrl ?? target.iconUrl;
    if (!thumb) { open(target); return; }
    let opened = false;
    const go = () => { if (!opened && !handoffCancelled.current) { opened = true; open(target); } };
    handoffCancelled.current = false;
    Image.prefetch([thumb], 'memory-disk').then(go, go);
    handoffTimer.current = setTimeout(go, 350);
  }, [queue, selected, open]);

  // Dev-only capture driver (Metro inspector): globalThis.__stampBook.open('explorer'), .titles(), .scroll(600), .tab('hunt'), .close().
  useEffect(() => {
    if (!devHooks) return;
    const g = globalThis as unknown as { __stampBook?: object };
    g.__stampBook = {
      open: (slug: string) => { const s = sections.flatMap(x => x.stamps).find(x => x.slug === slug); if (s) open(s); return !!s; },
      fresh: (slug: string) => { const s = sections.flatMap(x => x.stamps).find(x => x.slug === slug); if (s) { setFresh(true); setSelected(s); } return !!s; },
      titles: () => setTitlesOpen(true),
      closeTitles: () => setTitlesOpen(false),
      scroll: (y: number) => scroller.current?.scrollTo({ y, animated: false }),
      tab: (key: string) => pickRef.current(key),
      claimAll: () => openClaimRef.current(),
      close: () => closeRef.current(),
      claimNext: () => openNextClaim(),
    };
    return () => { delete g.__stampBook; };
  }, [devHooks, sections, open, openNextClaim]);
  const claim = useCallback(async (): Promise<ClaimResult> => {
    if (!selected || claimingRef.current) return { ok: false };
    if (previewMode) { pendingPatch.current.push(selected.id); return { ok: true }; }
    const id = selected.id;
    claimingRef.current = true;
    setMessage(null);
    try {
      const res = await claimStampReward(id);
      pendingPatch.current.push(id);
      refreshPlayer().catch(() => undefined);
      return { ok: true, levelsGained: Number(res?.levels_gained ?? 0) || 0, level: typeof res?.level === 'number' ? res.level : null };
    } catch {
      // A lost response can follow a successful claim. Read back before showing failure.
      try {
        const freshData = await getStamps();
        const confirmed = Object.values(freshData.stamps).flat().find(s => s.id === id);
        if (confirmed?.reward_claimed) { pendingPatch.current.push(id); refreshPlayer().catch(() => undefined); return { ok: true }; }
        haptic('warning');
        setMessage('Your prize didn’t come through. Tap Claim again.');
      } catch {
        setMessage('Not sure that went through. Reopen the Stamp Book to check.');
      }
      return { ok: false };
    } finally {
      claimingRef.current = false;
    }
  }, [selected, previewMode, refreshPlayer]);

  /**
   * Wear (stampId) or take off (null) a title. Optimistic: the book shows it on the tap, the server call and the player
   * refresh run behind it, and a failure puts the old title back (the caller shows the message).
   */
  const setTitle = useCallback(async (stampId: number | null, title: string | null): Promise<boolean> => {
    if (previewMode) { setPreviewTitle(title ?? ''); return true; }
    const before = wornTitle;
    setTitleOverride({ title });
    try {
      await equipStampTitle(stampId);
    } catch (e) {
      setTitleOverride({ title: before });
      throw e;
    }
    setResponse(current => current && { ...current, equipped_title: title });
    refreshPlayer().catch(() => undefined).finally(() => setTitleOverride(null));
    return true;
  }, [previewMode, refreshPlayer, wornTitle]);

  /** One sound per action: wearing is a bright confirm, taking off a soft tap (the unlock sparkle belongs to claiming). */
  const titleFeedback = (on: boolean) => {
    if (on) { haptic('success'); playSfx('ui.confirm', 0.8); } else { haptic('tapLight'); playSfx('ui.tap', 0.6); }
  };

  const toggleTitle = useCallback(async () => {
    if (!selected?.rewards.title || equipping) return;
    const wearing = wornTitle === selected.rewards.title;
    setEquipping(true);
    setMessage(null);
    titleFeedback(!wearing);
    try {
      await setTitle(wearing ? null : selected.id, wearing ? null : selected.rewards.title);
    } catch {
      haptic('warning');
      setMessage('Could not update your title. Try again.');
    } finally {
      setEquipping(false);
    }
  }, [selected, equipping, wornTitle, setTitle]);

  const wearFromList = useCallback(async (entry: TitleEntry | null) => {
    if (titleBusy) return;
    setTitleBusy(entry ? entry.title : '__remove');
    setTitleMessage(null);
    titleFeedback(!!entry);
    try {
      await setTitle(entry ? entry.stamp.id : null, entry ? entry.title : null);
    } catch {
      haptic('warning');
      setTitleMessage('That did not save. Try again.');
    } finally {
      setTitleBusy(null);
    }
  }, [titleBusy, setTitle]);

  /** Claim all: one stamp through the server; the book applies it when the sheet closes. */
  const claimOne = useCallback(async (stamp: BookStamp): Promise<boolean> => {
    if (previewMode) { pendingPatch.current.push(stamp.id); return true; }
    try {
      await claimStampReward(stamp.id);
      pendingPatch.current.push(stamp.id);
      return true;
    } catch {
      try {
        const fresh = await getStamps();
        if (Object.values(fresh.stamps).flat().find(s => s.id === stamp.id)?.reward_claimed) { pendingPatch.current.push(stamp.id); return true; }
      } catch { /* shown as not claimed: the gift stays and can be tried again */ }
      return false;
    }
  }, [previewMode]);

  const openClaim = useCallback(() => {
    const waiting = queue.filter(s => !pendingPatch.current.includes(s.id));
    if (waiting.length <= 1) { openNextClaim(); return; }
    playSfx('ui.modalOpen', 0.5);
    haptic('tapLight');
    setClaimAllOpen(waiting);
    // Claimed stamps count as seen: no slam waits behind a gift you already opened.
    waiting.forEach(s => openedRef.current.push(s.id));
  }, [queue, openNextClaim]);

  /** From a stamp card with 2+ gifts still waiting: close the card, then open Claim all (one Modal at a time). */
  const claimAllFromCard = useCallback(() => {
    close();
    setTimeout(() => openClaimRef.current(), 420);
  }, [close]);

  const closeClaimAll = useCallback(() => {
    setClaimAllOpen(null);
    if (!previewMode) refreshPlayer().catch(() => undefined);
    flushPatches();
    flushSeen();
  }, [previewMode, refreshPlayer, flushPatches, flushSeen]);

  const openTitles = useCallback(() => {
    playSfx('ui.modalOpen', 0.5);
    haptic('tapLight');
    setTitleMessage(null);
    setTitlesOpen(true);
  }, []);

  /** From the Titles list: close it first (one Modal at a time on iOS), then open the stamp. */
  const pendingFromTitles = useRef<BookStamp | null>(null);
  const openFromTitles = useCallback((stamp: BookStamp) => {
    pendingFromTitles.current = stamp;
    setTitlesOpen(false);
  }, []);
  /** The Titles dialog has finished closing (one Modal at a time on iOS): open the stamp it asked for. */
  const titlesClosed = useCallback(() => {
    setTitlesOpen(false);
    const stamp = pendingFromTitles.current;
    pendingFromTitles.current = null;
    if (stamp) open(stamp);
  }, [open]);

  const go = useCallback((stamp: BookStamp) => {
    const target = requirement(stamp).go;
    if (!target) return;
    setSelected(null);
    flushPatches();
    flushSeen();
    RootNavigation.navigate(target as GoTarget as never);
  }, [flushPatches, flushSeen]);

  /** Bookmark tabs: every page stays mounted; a tab scrolls its page up under the band (All: back to the cover). */
  const pick = useCallback((key: string) => {
    playSfx('ui.select', 0.7);
    haptic('tickSelection');
    setFilter(key);
    const y = key === 'all' ? 0 : Math.max(0, (sectionY.current[key] ?? 0) - TABS_H - 4);
    scroller.current?.scrollTo({ y, animated: !reducedMotion });
  }, [reducedMotion]);

  /** After a scroll settles, the tab of the page at the top lights up. */
  const onScrollSettled = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    fx.poke();
    const y = e.nativeEvent.contentOffset.y + TABS_H + 40;
    const firstTop = Math.min(...Object.values(sectionY.current));
    if (!Number.isFinite(firstTop) || y < firstTop + 20) { setFilter('all'); return; }
    let best = 'all';
    for (const [key, top] of Object.entries(sectionY.current)) if (top <= y && (best === 'all' || top > sectionY.current[best])) best = key;
    setFilter(best);
  }, [fx]);

  // Keep the active chip centred on screen.
  useEffect(() => {
    const c = chipX.current[filter];
    if (!c) return;
    chipScroller.current?.scrollTo({ x: Math.max(0, c.x + c.w / 2 - width / 2), animated: !reducedMotion });
  }, [filter, width, reducedMotion]);

  const markOpen = useCallback(() => {
    const g = globalThis as { __stampOpenMs?: number };
    if (g.__stampOpenMs === undefined || g.__stampOpenMs < 0) g.__stampOpenMs = Date.now() - mountedAt.current;
  }, []);
  useEffect(() => { if (__DEV__) (globalThis as { __stampOpenMs?: number }).__stampOpenMs = -1; }, []);
  pickRef.current = pick;
  openClaimRef.current = openClaim;
  const onScroll = useAnimatedScrollHandler(e => { fx.scrollY.value = e.contentOffset.y; });
  const wallet: Wallet = useMemo(() => ({ energy: player?.energy ?? 0, tickets: player?.tickets ?? 0, xp: player?.total_experience ?? 0, coins: player?.coins ?? 0 }),
    [player?.energy, player?.tickets, player?.total_experience, player?.coins]);

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>Stamp Book</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>

      <BookFxProvider value={fx}>
        <View style={styles.screen} onTouchStart={fx.poke} onLayout={e => { fx.viewportH.value = e.nativeEvent.layout.height; }}>
          <Image source={BACKGROUND} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />

          {status !== 'ready' ? (
            <View style={styles.state}>
              <Text style={styles.stateText}>{status === 'loading' ? 'Opening your Stamp Book...' : 'Your Stamp Book could not load.'}</Text>
              {status === 'error' && (
                <Pressable onPress={() => { lastFetch.current = 0; load(true); }} style={styles.retry} accessibilityRole="button">
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              )}
            </View>
          ) : (
            <Animated.ScrollView ref={scroller as never} onScroll={onScroll} scrollEventThrottle={16}
              contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} stickyHeaderIndices={[2]}
              onMomentumScrollEnd={onScrollSettled} onScrollEndDrag={onScrollSettled}>
              <Cover earned={totals.earned} total={totals.total} toClaim={totals.toClaim} worn={wornTitle}
                titlesOwned={titleCount.owned} titlesTotal={titleCount.total} onClaim={openClaim} onTitles={openTitles}
                rarest={rarest} onOpen={open} />

              <AlmostThere stamps={almost} accentFor={accentFor} onOpen={open} />

              <View style={styles.tabsWrap}>
                <Animated.ScrollView ref={chipScroller as never} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                  {[{ key: 'all', label: 'All', color: '#FFFFFF', earned: totals.earned, total: totals.total, stamps: sections.flatMap(s => s.stamps) },
                    ...sections].map(section => (
                    <Tab key={section.key} label={section.label} color={section.color} icon={SECTION_ICON[section.key] ?? 'star'}
                      active={filter === section.key} earned={section.earned} total={section.total}
                      dot={section.stamps.some(s => s.claimable)}
                      onLayout={e => {
                        const c = { x: e.nativeEvent.layout.x, w: e.nativeEvent.layout.width };
                        chipX.current[section.key] = c;
                        if (section.key === filter) chipScroller.current?.scrollTo({ x: Math.max(0, c.x + c.w / 2 - width / 2), animated: false });
                      }}
                      onPress={() => pick(section.key)} />
                  ))}
                </Animated.ScrollView>
              </View>

              {sections.length === 0 && <Text style={styles.stateText}>No stamps yet. Check back soon.</Text>}

              {/* One book board behind every page: blue cloth, stitched edge, gold corners (the cover's binding). */}
              <View style={styles.board} onLayout={e => { boardY.current = e.nativeEvent.layout.y; setBoardTopState(e.nativeEvent.layout.y); }}>
                <View style={styles.boardStitch} pointerEvents="none" />
              {(allPages ? sections : sections.slice(0, 1)).map(section => (
                <SectionPage key={section.key} section={section} width={width} boardTop={boardTopState} onTop={y => { sectionY.current[section.key] = boardY.current + y; }}
                  onFirstLayout={__DEV__ ? markOpen : undefined}
                  seenRef={seenRef} seenVersion={seenVersion} celebrating={celebrate === section.key} onOpen={open} />
              ))}
              </View>
              <View style={{ height: NAV_COVER + insets.bottom + 24 }} />
            </Animated.ScrollView>
          )}
          {celebrate && <Confetti width={width} height={height} seed={7} count={40} />}
        </View>

        <StampCard
          stamp={selected}
          accent={selected ? accentFor(selected.section) : '#2F6BFF'}
          reducedMotion={reducedMotion}
          fresh={fresh}
          wallet={wallet}
          equipping={equipping}
          message={message}
          wearingTitle={!!selected?.rewards.title && wornTitle === selected.rewards.title}
          nextStamp={nextClaim}
          nextCount={queue.filter(s => s.id !== selected?.id && !pendingPatch.current.includes(s.id)).length}
          onClaim={claim}
          onNext={openNextClaim}
          onClaimAll={claimAllFromCard}
          onGo={go}
          onToggleTitle={toggleTitle}
          onClose={close}
        />
        <TitlesSheet visible={titlesOpen} entries={titles} worn={wornTitle} busy={titleBusy} message={titleMessage}
          onWear={entry => { void wearFromList(entry); }} onRemove={() => { void wearFromList(null); }}
          onOpenStamp={openFromTitles} onClose={() => setTitlesOpen(false)} onDismiss={titlesClosed} />
        <ClaimAll stamps={claimAllOpen ?? []} visible={!!claimAllOpen} reducedMotion={reducedMotion} worn={wornTitle}
          onClaimOne={claimOne} onWear={stamp => setTitle(stamp.id, stamp.rewards.title).then(() => undefined, () => undefined)} onClose={closeClaimAll} />
      </BookFxProvider>
    </Wrapper>
  );
}

/**
 * The book's cover: blue cloth with gold corner caps and a stitched edge. Stamps earned (ring and percent), your
 * shark wearing your title (tap: Titles), and one big gold Claim when rewards wait.
 */
function Cover({ earned, total, toClaim, worn, titlesOwned, titlesTotal, onClaim, onTitles, rarest, onOpen }: {
  earned: number; total: number; toClaim: number; worn: string | null; titlesOwned: number; titlesTotal: number;
  onClaim: () => void; onTitles: () => void; rarest: BookStamp | null; onOpen: (s: BookStamp) => void;
}) {
  const fx = useBookFx();
  const R = 34;
  const { circumference, offset } = ring(total > 0 ? earned / total : 0, R);
  const pct = total > 0 ? Math.floor((earned / total) * 100) : 0;
  const bounce = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * fx.pulse.value }, { rotate: `${-8 * fx.pulse.value}deg` }] }));
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.03 * fx.pulse.value }] }));
  return (
    <View style={styles.coverWrap}>
      <View style={styles.coverLip} />
      <View style={styles.cover}>
        <View style={styles.coverStitch} pointerEvents="none" />
        {(['tl', 'tr', 'bl', 'br'] as const).map(c => <View key={c} style={[styles.corner, CORNER_CAP[c]]} pointerEvents="none" />)}
        <View style={styles.coverTop}>
          <View style={styles.coverRing} accessible accessibilityLabel={`${earned} of ${total} stamps, ${pct} percent`}>
            <Svg width={86} height={86} viewBox="0 0 86 86">
              <Circle cx={43} cy={43} r={R} stroke="rgba(255,255,255,0.28)" strokeWidth={10} fill="none" />
              <Circle cx={43} cy={43} r={R} stroke="#FFCF3B" strokeWidth={10} fill="none" strokeLinecap="round"
                strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} rotation={-90} origin="43, 43" />
            </Svg>
            <View style={styles.coverCount}>
              <Text style={styles.coverNum} maxFontSizeMultiplier={1.4}>{earned}</Text>
              <Text style={styles.coverOf} maxFontSizeMultiplier={1.4}>of {total}</Text>
            </View>
          </View>
          <View style={styles.coverText}>
            <Text style={styles.coverTitle} maxFontSizeMultiplier={1.4}>My Stamps</Text>
            <Text style={styles.coverPct} maxFontSizeMultiplier={1.4}>{pct}% stamped</Text>
          </View>
          <Pressable onPress={onTitles} style={({ pressed }) => [styles.sharkTitle, pressed && styles.pressed]} hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={worn ? `Your title: ${worn}. Titles, ${titlesOwned} of ${titlesTotal}.` : `No title yet. Titles, ${titlesOwned} of ${titlesTotal}.`}
            accessibilityHint="Shows every title and how to get it">
            <Image source={SHARK} style={styles.coverShark} contentFit="contain" />
            <View style={[styles.titlePill, !worn && styles.titlePillEmpty]}>
              <GameIcon name="crown" size={16} />
              <Text style={[styles.titlePillText, !worn && styles.titlePillTextEmpty]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65}
                maxFontSizeMultiplier={1.4}>{worn ?? 'No title'}</Text>
            </View>
            <View style={styles.titlesBadge}><Text style={styles.titlesBadgeText} maxFontSizeMultiplier={1.1}>Titles {titlesOwned}/{titlesTotal}</Text></View>
          </Pressable>
        </View>
        {/* Pride: the rarest stamp you own, in a foil frame of its rarity. */}
        {!!rarest && (
          <Pressable onPress={() => { playSfx('ui.tap'); haptic('tapLight'); onOpen(rarest); }} style={({ pressed }) => [styles.showcase, pressed && styles.pressed]}
            accessibilityRole="button" accessibilityLabel={`Your rarest stamp: ${rarest.name}, ${stampRarity(rarest.rarity).label}`}>
            <View style={[styles.showcaseArt, { borderColor: stampRarity(rarest.rarity).frame }]}><StampArt stamp={rarest} size="thumb" /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.showcaseLabel} maxFontSizeMultiplier={1.3}>RAREST STAMP</Text>
              <Text style={styles.showcaseName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3}>{rarest.shortName}</Text>
            </View>
            <View style={[styles.showcasePill, { backgroundColor: stampRarity(rarest.rarity).chip, borderColor: stampRarity(rarest.rarity).frame }]}>
              <Text style={styles.showcasePillText} maxFontSizeMultiplier={1.2}>{stampRarity(rarest.rarity).label.toUpperCase()}</Text>
            </View>
          </Pressable>
        )}
        {toClaim > 0 && (
          <Animated.View style={!fx.reducedMotion && pulse}>
            <Pressable onPress={onClaim} style={({ pressed }) => [styles.claimAll, pressed && styles.pressed]} accessibilityRole="button"
              accessibilityLabel={`Claim rewards from ${toClaim} ${toClaim === 1 ? 'stamp' : 'stamps'}`}>
              <View style={styles.claimAllFace}>
                <Animated.View style={!fx.reducedMotion && bounce}><GameIcon name="gift" size={30} /></Animated.View>
                <Text style={styles.claimAllText} maxFontSizeMultiplier={1.4}>{toClaim === 1 ? 'Claim your reward!' : `Claim all ${toClaim}!`}</Text>
              </View>
              <View style={styles.badge}><Text style={styles.badgeText} maxFontSizeMultiplier={1}>{toClaim}</Text></View>
            </Pressable>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const CORNER_CAP = {
  tl: { left: -3, top: -3, borderTopLeftRadius: 24 }, tr: { right: -3, top: -3, borderTopRightRadius: 24 },
  bl: { left: -3, bottom: -3, borderBottomLeftRadius: 24 }, br: { right: -3, bottom: -3, borderBottomRightRadius: 24 },
} as const;

/** The 3 stamps closest to done: ghost art in its ring, the name and "14/25". */
function AlmostThere({ stamps, accentFor, onOpen }: { stamps: readonly BookStamp[]; accentFor: (k: string) => string; onOpen: (s: BookStamp) => void }) {
  if (!stamps.length) return null;
  return (
    <View style={styles.almost}>
      <View style={styles.almostHead}>
        <GameIcon name="star" size={20} />
        <Text style={styles.almostTitle} maxFontSizeMultiplier={1.4}>Almost there</Text>
      </View>
      <View style={styles.almostRow}>
        {stamps.map(s => (
          <Pressable key={s.id} style={({ pressed }) => [styles.almostItem, pressed && styles.pressed]} onPress={() => { playSfx('ui.tap'); haptic('tapLight'); onOpen(s); }}
            accessibilityRole="button" accessibilityLabel={`${s.name}. ${progressLabel(s)}. ${remainingLine(s)}`}>
            <View style={styles.almostArt}>
              <View style={styles.almostGhost}><StampArt stamp={s} size="thumb" fallbackIcon={requirement(s).icon} /></View>
              <MiniRing fraction={s.percent / 100} color={accentFor(s.section)} />
            </View>
            <Text style={styles.almostName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.4}>{s.shortName}</Text>
            <View style={styles.almostCount}>
              <GameIcon name={requirement(s).icon} size={14} />
              <Text style={styles.almostCountText} maxFontSizeMultiplier={1.4}>{progressLabel(s)}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function MiniRing({ fraction, color }: { fraction: number; color: string }) {
  const size = 60; const r = 26;
  const { circumference, offset } = ring(fraction, r);
  return (
    <Svg width={size} height={size} style={StyleSheet.absoluteFill} pointerEvents="none">
      <Circle cx={30} cy={30} r={r} stroke="rgba(20,33,61,0.14)" strokeWidth={5} fill="none" />
      <Circle cx={30} cy={30} r={r} stroke={color} strokeWidth={5} fill="none" strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} rotation={-90} origin="30, 30" />
    </Svg>
  );
}

function Tab({ label, color, icon, active, earned, total, dot, onPress, onLayout }: {
  label: string; color: string; icon: GameIconName; active: boolean; earned: number; total: number; dot: boolean;
  onPress: () => void; onLayout: (e: LayoutChangeEvent) => void;
}) {
  const done = total > 0 && earned >= total;
  return (
    <Pressable onPress={onPress} onLayout={onLayout} accessibilityRole="tab" accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${earned} of ${total}${dot ? ', rewards to claim' : ''}`}
      style={[styles.tab, active && { backgroundColor: color === '#FFFFFF' ? PAPER : color, borderColor: '#FFFFFF' }]}>
      <GameIcon name={icon} size={20} />
      <Text style={[styles.tabText, active && styles.tabTextActive]} maxFontSizeMultiplier={1.4}>{label}</Text>
      <Text style={[styles.tabCount, active && styles.tabTextActive]} maxFontSizeMultiplier={1.4}>{earned}/{total}</Text>
      {done && <GameIcon name="check" size={18} />}
      {dot && <View style={styles.dot} />}
    </Pressable>
  );
}

const SectionPage = memo(function SectionPage({ section, width, boardTop, onTop, onFirstLayout, seenRef, seenVersion, celebrating, onOpen }: {
  section: BookSection; width: number; boardTop: number; onTop: (y: number) => void; onFirstLayout?: () => void; seenRef: { readonly current: Set<string> | null }; seenVersion: number;
  celebrating: boolean; onOpen: (s: BookStamp) => void;
}) {
  void seenVersion; // re-render this section (only) when NEW tags change
  const seen = seenRef.current;
  const sectionTop = useSharedValue(0);
  const gridLocal = useSharedValue(0);
  const gridTop = useDerivedValue(() => sectionTop.value + gridLocal.value);
  const cols = 3;
  const tile = Math.floor((width - (BOARD_INSET + 3) * 2 - PAGE_SIDE * 2 - PAGE_PAD * 2 - PAGE_BORDER * 2 - GAP * (cols - 1)) / cols);
  const tileH = Math.round(tile * 1.36);
  const pct = section.total > 0 ? Math.round((section.earned / section.total) * 100) : 0;
  // DONE only once every stamp is stamped AND no gift is still waiting on the page (claiming the last gift slams the seal).
  const complete = section.total > 0 && section.earned >= section.total && !section.stamps.some(s => s.claimable);
  return (
    <View style={styles.pageWrap} onLayout={e => { sectionTop.value = boardTop + e.nativeEvent.layout.y; onTop(e.nativeEvent.layout.y); onFirstLayout?.(); }}>
      <View style={styles.pageLip} />
      <View style={styles.page}>
        <View style={styles.stitch} pointerEvents="none" />
        <View style={styles.pageHead}>
          <View style={[styles.sectionBadge, { backgroundColor: section.color }]}><GameIcon name={SECTION_ICON[section.key] ?? 'star'} size={24} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.4}>{section.label}</Text>
            <Text style={styles.sectionBlurb} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85} maxFontSizeMultiplier={1.4}>{section.blurb}</Text>
          </View>
          {complete ? (
            <PageSeal celebrating={celebrating} />
          ) : (
            <GameIcon name={celebrating ? 'chestOpen' : 'chest'} size={36} accessibilityLabel="Finish the page to fill it" />
          )}
        </View>
        <View style={styles.sectionBarRow} accessible accessibilityLabel={`${section.earned} of ${section.total} stamped`}>
          <View style={styles.sectionBar}>
            <View style={[styles.sectionFill, { width: `${Math.max(pct, 0)}%`, backgroundColor: section.color }]} />
          </View>
          <Text style={styles.sectionBarText} maxFontSizeMultiplier={1.4}>{section.earned} / {section.total}</Text>
        </View>
        <View style={styles.grid} onLayout={(e: LayoutChangeEvent) => { gridLocal.value = e.nativeEvent.layout.y; }}>
          {section.stamps.map((stamp, i) => (
            <StampTile key={stamp.id} stamp={stamp} size={tile} height={tileH} accent={section.color} col={i % cols}
              isNew={!!seen && stamp.earned && !seen.has(String(stamp.id))} gridTop={gridTop as SharedValue<number>} onPress={onOpen} />
          ))}
        </View>
      </View>
    </View>
  );
});

/** The gold seal on a finished page: it slams in (pop, thunk) the first time the page completes. */
function PageSeal({ celebrating }: { celebrating: boolean }) {
  const fx = useBookFx();
  const pop = useSharedValue(1);
  useEffect(() => {
    if (!celebrating || fx.reducedMotion) return;
    pop.value = 1.8;
    pop.value = withSpring(1, { damping: 9, stiffness: 260 });
    playSfx('fx.hit', 0.8);
    haptic('hitRigid');
  }, [celebrating, fx.reducedMotion, pop]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }, { rotate: '-10deg' }] }));
  return (
    <Animated.View style={[styles.seal, style]} accessible accessibilityLabel="Page complete">
      <GameIcon name="check" size={22} /><Text style={styles.sealText} maxFontSizeMultiplier={1.1}>DONE</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden', backgroundColor: '#0a77bf' },
  scroll: { paddingTop: 12 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  stateText: { color: '#FFFFFF', fontFamily: 'Shark', fontSize: 18, textAlign: 'center', paddingHorizontal: 24, textShadowColor: '#05346e', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 },
  retry: { marginTop: 14, borderRadius: 14, backgroundColor: '#FFCF3B', paddingHorizontal: 22, paddingVertical: 11, borderWidth: 3, borderColor: INK },
  retryText: { color: INK, fontFamily: 'Shark', fontSize: 16 },
  pressed: { opacity: 0.88, transform: [{ scale: 0.98 }] },

  // Cover: blue cloth, gold corner caps, a stitched edge.
  coverWrap: { marginHorizontal: SIDE },
  coverLip: { position: 'absolute', left: 0, right: 0, top: 8, bottom: -6, borderRadius: 24, backgroundColor: '#03417A' },
  cover: { padding: 14, borderRadius: 24, backgroundColor: '#0A6FB8', borderWidth: 3, borderColor: '#0B3E78', gap: 10 },
  coverStitch: { position: 'absolute', left: 7, right: 7, top: 7, bottom: 7, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,214,102,0.75)' },
  corner: { position: 'absolute', width: 30, height: 30, backgroundColor: '#FFC21A', borderWidth: 2.5, borderColor: '#B07A00' },
  coverTop: { flexDirection: 'row', alignItems: 'center' },
  coverRing: { width: 86, height: 86, alignItems: 'center', justifyContent: 'center' },
  coverCount: { position: 'absolute', alignItems: 'center' },
  coverNum: { fontFamily: 'Shark', fontSize: 28, color: '#FFFFFF', lineHeight: 30 },
  coverOf: { fontFamily: 'Shark', fontSize: 14, color: '#E2F6FF' },
  coverText: { flex: 1, marginLeft: 10, gap: 2 },
  coverTitle: { fontFamily: 'Shark', fontSize: 24, color: '#FFFFFF', textTransform: 'uppercase', textShadowColor: '#05346e', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  coverPct: { fontFamily: 'Shark', fontSize: 15, color: '#FFCF3B' },
  sharkTitle: { alignItems: 'center', width: 116, minHeight: 44 },
  coverShark: { width: 58, height: 62, marginBottom: -12 },
  titlePill: {
    maxWidth: 116, flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 30, backgroundColor: '#FFCF3B', borderRadius: 15,
    paddingHorizontal: 8, borderWidth: 2, borderColor: '#FFFFFF', borderBottomWidth: 4, borderBottomColor: '#D99A00',
  },
  titlePillEmpty: { backgroundColor: '#E2F6FF', borderBottomColor: '#9FB2C9' },
  titlePillText: { flexShrink: 1, fontFamily: 'Shark', fontSize: 14, color: INK },
  titlePillTextEmpty: { color: MUTED_INK },
  showcase: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,40,90,0.35)', borderRadius: 16, padding: 8, minHeight: 56,
    borderWidth: 2, borderColor: 'rgba(255,214,102,0.7)',
  },
  showcaseArt: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, backgroundColor: '#FFF6DE', padding: 2 },
  showcaseLabel: { fontFamily: 'Shark', fontSize: 12, color: '#FFCF3B', letterSpacing: 1 },
  showcaseName: { fontFamily: 'Shark', fontSize: 17, color: '#FFFFFF' },
  showcasePill: { borderRadius: 12, borderWidth: 2, paddingHorizontal: 10, paddingVertical: 3 },
  showcasePillText: { fontFamily: 'Shark', fontSize: 13, color: '#05346e', letterSpacing: 0.5 },
  titlesBadge: { marginTop: 3, backgroundColor: '#05559A', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.8)' },
  titlesBadgeText: { fontFamily: 'Shark', fontSize: 12, color: '#FFFFFF' },
  claimAll: { borderRadius: 18, backgroundColor: '#C98A00', paddingBottom: 5 },
  claimAllFace: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 52, paddingHorizontal: 14, borderRadius: 18,
    backgroundColor: '#FFCF3B', borderWidth: 3, borderColor: '#FFFFFF',
  },
  claimAllText: { fontFamily: 'Shark', fontSize: 22, color: '#FFFFFF', textShadowColor: '#8A5A00', textShadowOffset: { width: 1.5, height: 1.5 }, textShadowRadius: 0 },
  badge: { position: 'absolute', top: -9, right: -6, minWidth: 28, height: 28, borderRadius: 14, backgroundColor: '#E3262E', borderWidth: 2.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { fontFamily: 'Shark', fontSize: 15, color: '#FFFFFF' },

  // Almost there
  almost: {
    marginHorizontal: SIDE, marginTop: 16, borderRadius: 20, backgroundColor: PAPER, borderWidth: 3, borderColor: '#FFFFFF',
    paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10,
    shadowColor: '#022a55', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.45, shadowRadius: 0,
  },
  almostHead: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  almostTitle: { fontFamily: 'Shark', fontSize: 17, color: INK, textTransform: 'uppercase' },
  almostRow: { flexDirection: 'row', gap: 8 },
  almostItem: { flex: 1, alignItems: 'center', borderRadius: 14, paddingVertical: 4, minHeight: 44 },
  almostArt: { width: 60, height: 60, alignItems: 'center', justifyContent: 'center' },
  almostGhost: { width: 44, height: 44, opacity: 0.6 },
  almostName: { fontFamily: 'Shark', fontSize: 13, color: INK, marginTop: 2, textTransform: 'uppercase', maxWidth: '100%' },
  almostCount: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  almostCountText: { fontFamily: 'Shark', fontSize: 13, color: MUTED_INK },

  // Bookmark tabs: a solid band so the page never shows through when it sticks.
  tabsWrap: { paddingVertical: 9, marginTop: 8, backgroundColor: 'rgba(4,72,140,0.94)', borderBottomWidth: 2, borderBottomColor: 'rgba(255,255,255,0.35)' },
  tabs: { paddingHorizontal: SIDE, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22,
    backgroundColor: '#0768b9', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#022a55', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.6, shadowRadius: 0,
  },
  tabText: { fontFamily: 'Shark', fontSize: 15, color: '#FFFFFF' },
  tabCount: { fontFamily: 'Shark', fontSize: 14, color: '#E2F6FF' },
  tabTextActive: { color: INK },
  // Solid red with a dark rim, so the gift dot survives grayscale.
  dot: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: '#E3262E', borderWidth: 2.5, borderColor: '#7A0F14' },

  // Paper page
  board: {
    // Full bleed: the book board runs edge to edge, so no wallpaper shows beside the pages.
    marginHorizontal: 0, marginTop: 12, paddingBottom: 18, paddingHorizontal: BOARD_INSET + 3, borderTopLeftRadius: 28, borderTopRightRadius: 28, backgroundColor: '#0A6FB8',
    borderTopWidth: 3, borderColor: '#0B3E78',
  },
  boardStitch: { position: 'absolute', left: 6, right: 6, top: 6, bottom: 6, borderRadius: 22, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,214,102,0.6)' },
  pageWrap: { marginHorizontal: PAGE_SIDE, marginTop: 14 },
  pageLip: { position: 'absolute', left: 0, right: 0, top: 8, bottom: -6, borderRadius: 24, backgroundColor: '#C9AE78' },
  page: { borderRadius: 24, backgroundColor: PAPER, borderWidth: PAGE_BORDER, borderColor: '#FFFFFF', padding: PAGE_PAD, paddingBottom: PAGE_PAD + 4, overflow: 'hidden' },
  stitch: { position: 'absolute', left: 6, right: 6, top: 6, bottom: 6, borderRadius: 19, borderWidth: 1.5, borderStyle: 'dashed', borderColor: SLOT_EDGE, opacity: 0.8 },
  pageHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionBadge: { width: 42, height: 42, borderRadius: 21, borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontFamily: 'Shark', fontSize: 21, color: INK, textTransform: 'uppercase' },
  sectionBlurb: { fontFamily: 'Shark', fontSize: 14, color: MUTED_INK },
  sectionBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 16 },
  sectionBar: {
    flex: 1, height: 14, borderRadius: 7, backgroundColor: 'rgba(20,33,61,0.10)', overflow: 'hidden',
    borderWidth: 1.5, borderColor: 'rgba(20,33,61,0.2)',
  },
  sectionFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 9 },
  sectionBarText: { fontFamily: 'Shark', fontSize: 16, color: INK, minWidth: 44, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, rowGap: GAP + 8 },
  seal: {
    width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFC21A', borderWidth: 3, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center',
  },
  sealText: { fontFamily: 'Shark', fontSize: 11, color: INK, marginTop: -2 },
});
