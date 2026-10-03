/**
 * Stamp Book v2: a passport sticker book on Alex's shark-camo ocean.
 * Hero: progress ring, a gold "Claim n!" button that starts the claim chain,
 * and a "Next stamp" slot with a Go button. Section chips with icons, counts
 * and red dots scroll themselves into view. Each section is a page with a
 * chest at the end of its bar; a small filtered section becomes a two-column
 * album page with a "Next up" callout. Tap a stamp for the big card.
 *
 * Performance: one shared shine clock (BookFx), tiles never re-render on card
 * open/close or scroll, stamp objects keep identity across refetches, the
 * focus refetch is throttled to 30 s, and tile thumbs are prefetched.
 */
import { memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions, type LayoutChangeEvent, type ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedScrollHandler, useAnimatedStyle, useDerivedValue, useSharedValue, type SharedValue } from 'react-native-reanimated';
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
import StampTile, { INK } from './stampbook/StampTile';
import StampCard, { type Wallet } from './stampbook/StampCard';
import StampArt from './stampbook/StampArt';
import { BookFxProvider, useBookClocks, useBookFx } from './stampbook/BookFx';
import { Confetti } from './stampbook/SlamFx';
import { prefetchList } from './stampbook/art';
import { loadCelebrated, loadSeen, saveCelebrated, saveSeen } from './stampbook/seen';
import { takeStampsDirty } from './stampbook/dirty';
import {
  bookTotals, buildBook, claimQueue, nextUp, remainingLine, requirement, ring, stampIndex,
  type BookSection, type BookStamp, type GoTarget,
} from './stampbook/model';

const GAP = 10;
const SIDE = 14;
const REFETCH_MS = 30_000;
/** The floating compass nav covers about this much of the bottom. */
const NAV_COVER = 150;
const SECTION_ICON: Record<string, GameIconName> = {
  parks: 'map', hunt: 'pin', rides: 'coin', friends: 'member', streaks: 'streak', milestones: 'trophy', special: 'star',
};

export default function StampBookScreen() {
  const previewMode = __DEV__ && process.env.EXPO_PUBLIC_STAMP_BOOK_PREVIEW === '1';
  const { player, refreshPlayer } = useContext(AuthContext);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const focused = useIsFocused();
  const reducedMotion = useUiReducedMotion();
  const scroller = useRef<ScrollView>(null);
  const chipScroller = useRef<ScrollView>(null);
  const chipX = useRef<Record<string, { x: number; w: number }>>({});

  const [response, setResponse] = useState<StampsResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<BookStamp | null>(null);
  const [fresh, setFresh] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Seen stamps live in a ref so opening a card never changes `open` (no tile re-render on the slam frame).
  const seenRef = useRef<Set<string> | null>(null);
  const [seenVersion, setSeenVersion] = useState(0);
  const claimingRef = useRef(false);
  const forceNext = useRef(false);
  const [celebrate, setCelebrate] = useState<string | null>(null);
  const lastFetch = useRef(0);
  const prevIndex = useRef<Map<number, BookStamp>>(new Map());
  const pendingPatch = useRef<number[]>([]);

  const fx = useBookClocks(focused && !selected, reducedMotion);

  const sections = useMemo(() => {
    if (!response) return [];
    const book = buildBook(response, prevIndex.current);
    prevIndex.current = stampIndex(book);
    return book;
  }, [response]);
  const totals = useMemo(() => bookTotals(sections), [sections]);
  const queue = useMemo(() => claimQueue(sections), [sections]);
  const next = useMemo(() => nextUp(sections, filter), [sections, filter]);
  const shown = filter === 'all' ? sections : sections.filter(s => s.key === filter);
  const accentFor = useCallback((key: string) => sections.find(s => s.key === key)?.color ?? '#2F6BFF', [sections]);

  useEffect(() => { loadSeen().then(set => { seenRef.current = set; setSeenVersion(v => v + 1); }); }, []);

  const load = useCallback((force: boolean) => {
    if (previewMode) {
      const { PREVIEW_BOOK } = require('./stampbook/preview');
      setResponse(PREVIEW_BOOK);
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
  }, [previewMode]);

  useFocusEffect(useCallback(() => {
    const force = forceNext.current;
    forceNext.current = false;
    load(force);
  }, [load]));

  // Dev-only visual checks: open a section or a stamp card straight away.
  const devHooks = __DEV__ && (previewMode || process.env.EXPO_PUBLIC_STAMP_BOOK_LIVE === '1');
  useEffect(() => {
    if (!devHooks || status !== 'ready') return;
    const tab = process.env.EXPO_PUBLIC_STAMP_BOOK_TAB;
    if (tab) setFilter(tab);
    const slug = process.env.EXPO_PUBLIC_STAMP_BOOK_OPEN;
    const found = slug ? sections.flatMap(s => s.stamps).find(s => s.slug === slug) : undefined;
    if (found) { const t = setTimeout(() => { setFresh(true); setSelected(found); }, 900); return () => clearTimeout(t); }
    // Preview should only run once on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [devHooks, status]);

  // Section completion moment: once per section per device.
  useEffect(() => {
    if (status !== 'ready' || !sections.length) return;
    let active = true;
    loadCelebrated().then(done => {
      if (!active) return;
      const complete = sections.find(s => s.total > 0 && s.earned >= s.total && !done.has(s.key));
      if (!complete) return;
      done.add(complete.key);
      saveCelebrated(done);
      setCelebrate(complete.key);
      playSfx('fx.reward');
      haptic('success');
      setTimeout(() => setCelebrate(null), 1600);
    });
    return () => { active = false; };
  }, [status, sections]);

  /** Applies claims made while the card was open, once it closes (keeps the slam frame clean). */
  const flushPatches = useCallback(() => {
    const ids = pendingPatch.current;
    if (!ids.length) return;
    pendingPatch.current = [];
    setResponse(current => current && {
      ...current,
      stamps: Object.fromEntries(Object.entries(current.stamps).map(([key, list]) =>
        [key, list.map(s => (ids.includes(s.id) ? { ...s, reward_claimed: true } : s))])),
    });
  }, []);

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

  const close = useCallback(() => {
    playSfx('ui.modalClose', 0.5);
    setSelected(null);
    flushPatches();
    flushSeen();
  }, [flushPatches, flushSeen]);

  const openNextClaim = useCallback(() => {
    const waiting = queue.filter(s => !pendingPatch.current.includes(s.id));
    const target = waiting.find(s => s.id !== selected?.id) ?? waiting[0];
    if (!target) return;
    open(target);
  }, [queue, selected, open]);

  const claim = useCallback(async (): Promise<boolean> => {
    if (!selected || claimingRef.current) return false;
    if (previewMode) { pendingPatch.current.push(selected.id); return true; }
    const id = selected.id;
    claimingRef.current = true;
    setMessage(null);
    try {
      await claimStampReward(id);
      pendingPatch.current.push(id);
      refreshPlayer().catch(() => undefined);
      return true;
    } catch {
      // A lost response can follow a successful claim. Read back before showing failure.
      try {
        const freshData = await getStamps();
        const confirmed = Object.values(freshData.stamps).flat().find(s => s.id === id);
        if (confirmed?.reward_claimed) { pendingPatch.current.push(id); refreshPlayer().catch(() => undefined); return true; }
        haptic('warning');
        setMessage('That did not go through. Try again.');
      } catch {
        setMessage('Not sure that went through. Reopen the Stamp Book to check.');
      }
      return false;
    } finally {
      claimingRef.current = false;
    }
  }, [selected, previewMode, refreshPlayer]);

  const toggleTitle = useCallback(async () => {
    if (!selected?.rewards.title || equipping || previewMode) return;
    const wearing = player?.title === selected.rewards.title;
    setEquipping(true);
    setMessage(null);
    try {
      await equipStampTitle(wearing ? null : selected.id);
      await refreshPlayer();
      haptic('success');
      setMessage(wearing ? 'Title removed from your profile.' : 'Title is now on your profile.');
    } catch {
      setMessage('Could not update your title. Try again.');
    } finally {
      setEquipping(false);
    }
  }, [selected, equipping, previewMode, player?.title, refreshPlayer]);

  const go = useCallback((stamp: BookStamp) => {
    const target = requirement(stamp).go;
    if (!target) return;
    setSelected(null);
    flushPatches();
    flushSeen();
    RootNavigation.navigate(target as GoTarget as never);
  }, [flushPatches, flushSeen]);

  const pick = useCallback((key: string) => {
    if (key === filter) return;
    playSfx('ui.select', 0.7);
    haptic('tickSelection');
    setFilter(key);
    scroller.current?.scrollTo({ y: 0, animated: !reducedMotion });
  }, [filter, reducedMotion]);

  // Keep the active chip centred on screen.
  useEffect(() => {
    const c = chipX.current[filter];
    if (!c) return;
    chipScroller.current?.scrollTo({ x: Math.max(0, c.x + c.w / 2 - width / 2), animated: !reducedMotion });
  }, [filter, width, reducedMotion]);

  const onScroll = useAnimatedScrollHandler(e => { fx.scrollY.value = e.contentOffset.y; });
  const wallet: Wallet = { energy: player?.energy ?? 0, tickets: player?.tickets ?? 0, xp: player?.total_experience ?? 0 };

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>Stamp Book</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>

      <BookFxProvider value={fx}>
        <View style={styles.page} onLayout={e => { fx.viewportH.value = e.nativeEvent.layout.height; }}>
          <Image source={require('../../assets/images/shark_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={styles.dim} />

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
              contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} stickyHeaderIndices={[1]}>
              <Hero earned={totals.earned} total={totals.total} toClaim={totals.toClaim} next={next}
                accentFor={accentFor} onClaim={openNextClaim} onOpen={open} onGo={go} />

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

              {shown.map(section => (
                <SectionBlock key={section.key} section={section} width={width} album={filter !== 'all' && section.stamps.length < 6}
                  seenRef={seenRef} seenVersion={seenVersion} celebrating={celebrate === section.key} onOpen={open} onGo={go} />
              ))}
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
          wearingTitle={!!selected?.rewards.title && player?.title === selected.rewards.title}
          nextCount={queue.filter(s => s.id !== selected?.id && !pendingPatch.current.includes(s.id)).length}
          onClaim={claim}
          onNext={openNextClaim}
          onGo={go}
          onToggleTitle={toggleTitle}
          onClose={close}
        />
      </BookFxProvider>
    </Wrapper>
  );
}

function Hero({ earned, total, toClaim, next, accentFor, onClaim, onOpen, onGo }: {
  earned: number; total: number; toClaim: number; next: BookStamp | null; accentFor: (k: string) => string;
  onClaim: () => void; onOpen: (s: BookStamp) => void; onGo: (s: BookStamp) => void;
}) {
  const fx = useBookFx();
  const R = 36;
  const { circumference, offset } = ring(total > 0 ? earned / total : 0, R);
  const bounce = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * fx.pulse.value }, { rotate: `${-8 * fx.pulse.value}deg` }] }));
  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.04 * fx.pulse.value }] }));
  return (
    <View style={styles.hero}>
      <View style={styles.heroTop}>
        <View style={styles.heroRing} accessible accessibilityLabel={`${earned} of ${total} stamps`}>
          <Svg width={92} height={92} viewBox="0 0 92 92">
            <Circle cx={46} cy={46} r={R} stroke="rgba(255,255,255,0.25)" strokeWidth={10} fill="none" />
            <Circle cx={46} cy={46} r={R} stroke="#FFCF3B" strokeWidth={10} fill="none" strokeLinecap="round"
              strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} rotation={-90} origin="46, 46" />
          </Svg>
          <View style={styles.heroCount}>
            <Text style={styles.heroNum} maxFontSizeMultiplier={1.2}>{earned}</Text>
            <Text style={styles.heroOf} maxFontSizeMultiplier={1.2}>of {total}</Text>
          </View>
        </View>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle} maxFontSizeMultiplier={1.2}>My Passport</Text>
          {toClaim > 0 ? (
            <Animated.View style={!fx.reducedMotion && pulse}>
              <Pressable onPress={onClaim} style={styles.claimAll} accessibilityRole="button"
                accessibilityLabel={`Claim rewards from ${toClaim} ${toClaim === 1 ? 'stamp' : 'stamps'}`}>
                <View style={styles.claimAllFace}>
                  <Animated.View style={!fx.reducedMotion && bounce}><GameIcon name="gift" size={26} /></Animated.View>
                  <Text style={styles.claimAllText} maxFontSizeMultiplier={1.2}>Claim {toClaim}!</Text>
                </View>
                <View style={styles.badge}><Text style={styles.badgeText}>{toClaim}</Text></View>
              </Pressable>
            </Animated.View>
          ) : (
            <Text style={styles.heroSub} maxFontSizeMultiplier={1.3}>Every stamp is something you did!</Text>
          )}
        </View>
      </View>
      {next && (
        <View style={styles.next}>
          <Pressable style={styles.nextMain} onPress={() => onOpen(next)} accessibilityRole="button"
            accessibilityLabel={`Next stamp: ${next.name}. ${remainingLine(next)}`}>
            <View style={styles.nextArt}><StampArt stamp={next} size="thumb" placeholder={accentFor(next.section)} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.nextLabel} maxFontSizeMultiplier={1.2}>NEXT STAMP</Text>
              <Text style={styles.nextName} numberOfLines={1} maxFontSizeMultiplier={1.2}>{next.shortName}</Text>
              <Text style={styles.nextLine} numberOfLines={1} maxFontSizeMultiplier={1.2}>{remainingLine(next)}</Text>
            </View>
          </Pressable>
          {requirement(next).go && (
            <Pressable onPress={() => onGo(next)} style={styles.go} accessibilityRole="button" accessibilityLabel={`Go. ${next.howTo}`}>
              <Text style={styles.goText}>Go!</Text>
            </Pressable>
          )}
        </View>
      )}
    </View>
  );
}

function Tab({ label, color, icon, active, earned, total, dot, onPress, onLayout }: {
  label: string; color: string; icon: GameIconName; active: boolean; earned: number; total: number; dot: boolean;
  onPress: () => void; onLayout: (e: LayoutChangeEvent) => void;
}) {
  return (
    <Pressable onPress={onPress} onLayout={onLayout} accessibilityRole="tab" accessibilityState={{ selected: active }}
      accessibilityLabel={`${label}, ${earned} of ${total}${dot ? ', rewards to claim' : ''}`}
      style={[styles.tab, active && { backgroundColor: color, borderColor: '#FFFFFF' }]}>
      <GameIcon name={icon} size={20} />
      <Text style={[styles.tabText, active && styles.tabTextActive]} maxFontSizeMultiplier={1.2}>{label}</Text>
      <Text style={[styles.tabCount, active && styles.tabTextActive]} maxFontSizeMultiplier={1.2}>{earned}/{total}</Text>
      {dot && <View style={styles.dot} />}
    </Pressable>
  );
}

const SectionBlock = memo(function SectionBlock({ section, width, album, seenRef, seenVersion, celebrating, onOpen, onGo }: {
  section: BookSection; width: number; album: boolean; seenRef: { readonly current: Set<string> | null }; seenVersion: number;
  celebrating: boolean; onOpen: (s: BookStamp) => void; onGo: (s: BookStamp) => void;
}) {
  void seenVersion; // re-render this section (only) when NEW tags change
  const seen = seenRef.current;
  const sectionTop = useSharedValue(0);
  const gridLocal = useSharedValue(0);
  const gridTop = useDerivedValue(() => sectionTop.value + gridLocal.value);
  const cols = album ? 2 : 3;
  const tile = Math.floor((width - SIDE * 2 - GAP * (cols - 1)) / cols);
  const tileH = Math.round(tile * (album ? 1.3 : 1.45));
  const pct = section.total > 0 ? Math.round((section.earned / section.total) * 100) : 0;
  const complete = section.total > 0 && section.earned >= section.total;
  // Same pick as the hero's Next stamp on a filtered tab, so both point at one stamp.
  const upNext = album ? nextUp([section]) ?? section.stamps.find(s => !s.earned && !s.secret) ?? null : null;
  return (
    <View style={styles.section} onLayout={e => { sectionTop.value = e.nativeEvent.layout.y; }}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionBadge, { backgroundColor: section.color }]}><GameIcon name={SECTION_ICON[section.key] ?? 'star'} size={22} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle} maxFontSizeMultiplier={1.2}>{section.label}</Text>
          <Text style={styles.sectionBlurb} maxFontSizeMultiplier={1.3}>{section.blurb}</Text>
        </View>
      </View>
      <View style={styles.sectionBarRow}>
        <View style={styles.sectionBar}>
          <View style={[styles.sectionFill, { width: `${Math.max(pct, 3)}%`, backgroundColor: section.color }]} />
          <Text style={styles.sectionBarText} maxFontSizeMultiplier={1.2}>{section.earned} / {section.total}</Text>
        </View>
        <GameIcon name={complete || celebrating ? 'chestOpen' : 'chest'} size={34} accessibilityLabel={complete ? 'Section complete' : 'Finish the section'} />
      </View>
      {upNext && (
        <View style={styles.callout}>
          <Pressable style={styles.calloutMain} onPress={() => onOpen(upNext)} accessibilityRole="button"
            accessibilityLabel={`Next up: ${upNext.name}. ${remainingLine(upNext)}`}>
            <GameIcon name={requirement(upNext).icon} size={26} />
            <Text style={styles.calloutText} maxFontSizeMultiplier={1.3}>Next up: {upNext.shortName}. {remainingLine(upNext)}</Text>
          </Pressable>
          {requirement(upNext).go && (
            <Pressable onPress={() => onGo(upNext)} style={styles.go} accessibilityRole="button" accessibilityLabel={`Go. ${upNext.howTo}`}>
              <Text style={styles.goText}>Go!</Text>
            </Pressable>
          )}
        </View>
      )}
      <View style={styles.grid} onLayout={(e: LayoutChangeEvent) => { gridLocal.value = e.nativeEvent.layout.y; }}>
        {section.stamps.map((stamp, i) => (
          <StampTile key={stamp.id} stamp={stamp} size={tile} height={tileH} accent={section.color} col={i % cols}
            isNew={!!seen && stamp.earned && !seen.has(String(stamp.id))} gridTop={gridTop as SharedValue<number>} onPress={onOpen} />
        ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  page: { flex: 1, overflow: 'hidden' },
  dim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(5,52,110,0.28)' },
  scroll: { paddingTop: 12 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  stateText: { color: '#FFFFFF', fontFamily: 'Shark', fontSize: 18, textAlign: 'center', paddingHorizontal: 24 },
  retry: { marginTop: 14, borderRadius: 14, backgroundColor: '#FFCF3B', paddingHorizontal: 22, paddingVertical: 11, borderWidth: 3, borderColor: INK },
  retryText: { color: INK, fontFamily: 'Shark', fontSize: 16 },

  hero: { marginHorizontal: SIDE, padding: 12, borderRadius: 22, backgroundColor: '#0a77bf', borderWidth: 2.5, borderColor: '#FFFFFF' },
  heroTop: { flexDirection: 'row', alignItems: 'center' },
  heroRing: { width: 92, height: 92, alignItems: 'center', justifyContent: 'center' },
  heroCount: { position: 'absolute', alignItems: 'center' },
  heroNum: { fontFamily: 'Shark', fontSize: 28, color: '#FFFFFF', lineHeight: 30 },
  heroOf: { fontFamily: 'Knockout', fontSize: 13, color: '#E2F6FF' },
  heroText: { flex: 1, marginLeft: 12 },
  heroTitle: { fontFamily: 'Shark', fontSize: 26, color: '#FFFFFF', textTransform: 'uppercase', textShadowColor: '#05346e', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  heroSub: { fontFamily: 'Knockout', fontSize: 15, color: '#E2F6FF', marginTop: 2 },
  claimAll: { marginTop: 6, alignSelf: 'flex-start', borderRadius: 16, backgroundColor: '#C98A00', paddingBottom: 5 },
  claimAllFace: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 46, paddingHorizontal: 14, borderRadius: 16,
    backgroundColor: '#FFCF3B', borderWidth: 2.5, borderColor: '#FFFFFF',
  },
  claimAllText: { fontFamily: 'Shark', fontSize: 20, color: '#FFFFFF', textShadowColor: '#8A5A00', textShadowOffset: { width: 1.5, height: 1.5 }, textShadowRadius: 0 },
  badge: { position: 'absolute', top: -8, right: -8, minWidth: 24, height: 24, borderRadius: 12, backgroundColor: '#E3262E', borderWidth: 2, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  badgeText: { fontFamily: 'Shark', fontSize: 13, color: '#FFFFFF' },
  next: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10, backgroundColor: 'rgba(0,40,90,0.4)', borderRadius: 16, padding: 8 },
  nextMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  nextArt: { width: 54, height: 54 },
  nextLabel: { fontFamily: 'Knockout', fontSize: 12, color: '#FFCF3B', letterSpacing: 1 },
  nextName: { fontFamily: 'Shark', fontSize: 17, color: '#FFFFFF' },
  nextLine: { fontFamily: 'Knockout', fontSize: 15, color: '#E2F6FF' },
  go: { minHeight: 44, minWidth: 64, borderRadius: 14, backgroundColor: '#3FBF3F', borderWidth: 2.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  goText: { fontFamily: 'Shark', fontSize: 19, color: '#FFFFFF', textShadowColor: '#1E6B1E', textShadowOffset: { width: 1.5, height: 1.5 }, textShadowRadius: 0 },

  tabsWrap: { paddingVertical: 10 },
  tabs: { paddingHorizontal: SIDE, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 12, borderRadius: 22,
    backgroundColor: '#0768b9', borderWidth: 2.5, borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: '#022a55', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.6, shadowRadius: 0,
  },
  tabText: { fontFamily: 'Shark', fontSize: 15, color: '#FFFFFF' },
  tabCount: { fontFamily: 'Knockout', fontSize: 14, color: '#E2F6FF' },
  tabTextActive: { color: INK },
  dot: { position: 'absolute', top: -3, right: -3, width: 14, height: 14, borderRadius: 7, backgroundColor: '#E3262E', borderWidth: 2, borderColor: '#FFFFFF' },

  section: { marginTop: 10, paddingHorizontal: SIDE },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionBadge: { width: 40, height: 40, borderRadius: 20, borderWidth: 2.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontFamily: 'Shark', fontSize: 22, color: '#FFFFFF', textTransform: 'uppercase', textShadowColor: '#05346e', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  sectionBlurb: { fontFamily: 'Knockout', fontSize: 14, color: '#E2F6FF' },
  sectionBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 14 },
  sectionBar: { flex: 1, height: 20, borderRadius: 10, backgroundColor: 'rgba(0,20,60,0.5)', overflow: 'hidden', justifyContent: 'center', borderWidth: 2, borderColor: 'rgba(255,255,255,0.6)' },
  sectionFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 9 },
  sectionBarText: { fontFamily: 'Shark', fontSize: 13, color: '#FFFFFF', textAlign: 'center', textShadowColor: '#05346e', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 },
  callout: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#0a77bf', borderRadius: 16, borderWidth: 2.5, borderColor: '#FFFFFF', padding: 10, marginBottom: 14 },
  calloutMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  calloutText: { flex: 1, fontFamily: 'Knockout', fontSize: 16, color: '#FFFFFF' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP, rowGap: GAP + 6 },
});
