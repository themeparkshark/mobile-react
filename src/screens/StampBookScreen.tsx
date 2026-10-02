/**
 * Stamp Book v2: a passport sticker book. A progress hero, a section picker
 * with per-section progress, and a grid per section: earned stamps in full
 * color with their date, locked ones as silhouettes with a one-line how-to.
 * Tapping a stamp opens the big card (slam, sound, haptic). Art is served by
 * the server (`icon_url`); see screens/stampbook/art.ts.
 */
import { useCallback, useContext, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import Svg, { Circle } from 'react-native-svg';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { claimStampReward, equipStampTitle, getStamps, type StampsResponse } from '../api/endpoints/me/stamps';
import { AuthContext } from '../context/AuthProvider';
import { haptic } from '../gamekit/Haptics';
import { playSfx } from '../gamekit/SFX';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import StampTile, { INK } from './stampbook/StampTile';
import StampCard from './stampbook/StampCard';
import { bookTotals, buildBook, ring, type BookSection, type BookStamp } from './stampbook/model';
import { PREVIEW_BOOK } from './stampbook/preview';

const GAP = 10;
const SIDE = 14;

export default function StampBookScreen() {
  const previewMode = __DEV__ && process.env.EXPO_PUBLIC_STAMP_BOOK_PREVIEW === '1';
  const { player, refreshPlayer } = useContext(AuthContext);
  const { width } = useWindowDimensions();
  const focused = useIsFocused();
  const reducedMotion = useUiReducedMotion();
  const scroller = useRef<ScrollView>(null);

  const [response, setResponse] = useState<StampsResponse | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [filter, setFilter] = useState<string>('all');
  const [selected, setSelected] = useState<BookStamp | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [slamKey, setSlamKey] = useState(0);

  const sections = useMemo(() => (response ? buildBook(response) : []), [response]);
  const totals = useMemo(() => bookTotals(sections), [sections]);
  const shown = filter === 'all' ? sections : sections.filter(s => s.key === filter);
  const accentFor = useCallback((key: string) => sections.find(s => s.key === key)?.color ?? '#2F6BFF', [sections]);

  const tile = Math.floor((width - SIDE * 2 - GAP * 2) / 3);

  useFocusEffect(useCallback(() => {
    let active = true;
    if (previewMode) {
      setResponse(PREVIEW_BOOK);
      setStatus('ready');
      return () => { active = false; };
    }
    setStatus(current => (current === 'ready' ? current : 'loading'));
    getStamps()
      .then(data => { if (active) { setResponse(data); setStatus('ready'); } })
      .catch(() => { if (active) setStatus(current => (current === 'ready' ? current : 'error')); });
    return () => { active = false; };
  }, [reloadKey, previewMode]));

  const patchStamp = useCallback((id: number, patch: Partial<{ reward_claimed: boolean }>) => {
    setResponse(current => current && {
      ...current,
      stamps: Object.fromEntries(Object.entries(current.stamps).map(([key, list]) =>
        [key, list.map(s => (s.id === id ? { ...s, ...patch } : s))])),
    });
  }, []);

  const open = useCallback((stamp: BookStamp) => {
    playSfx('ui.tap');
    haptic('tapLight');
    setMessage(null);
    setSlamKey(0);
    setSelected(stamp);
  }, []);

  const claim = useCallback(async () => {
    if (!selected || claiming || previewMode) {
      if (previewMode && selected) {
        setSelected({ ...selected, rewardClaimed: true });
        setSlamKey(k => k + 1);
      }
      return;
    }
    const id = selected.id;
    setClaiming(true);
    setMessage(null);
    try {
      await claimStampReward(id);
      patchStamp(id, { reward_claimed: true });
      setSelected(current => (current?.id === id ? { ...current, rewardClaimed: true } : current));
      setSlamKey(k => k + 1);
      setMessage('Rewards added.');
      refreshPlayer().catch(() => setMessage('Rewards claimed. Your profile will refresh when you reconnect.'));
    } catch {
      // A lost response can follow a successful claim. Read back before showing failure.
      try {
        const fresh = await getStamps();
        setResponse(fresh);
        const confirmed = Object.values(fresh.stamps).flat().find(s => s.id === id);
        if (confirmed?.reward_claimed) {
          setSelected(current => (current?.id === id ? { ...current, rewardClaimed: true } : current));
          setSlamKey(k => k + 1);
          setMessage('Rewards added.');
          refreshPlayer().catch(() => undefined);
        } else {
          haptic('warning');
          setMessage('That did not go through. Try again.');
        }
      } catch {
        setMessage('Not sure that went through. Reopen the Stamp Book to check.');
      }
    } finally {
      setClaiming(false);
    }
  }, [selected, claiming, previewMode, patchStamp, refreshPlayer]);

  const toggleTitle = useCallback(async () => {
    if (!selected?.rewardClaimed || !selected.rewards.title || equipping || previewMode) return;
    const wearing = player?.title === selected.rewards.title;
    setEquipping(true);
    setMessage(null);
    try {
      await equipStampTitle(wearing ? null : selected.id);
      await refreshPlayer();
      haptic('success');
      setMessage(wearing ? 'Title removed from your profile.' : 'Title is now on your profile.');
    } catch {
      try {
        const fresh = await refreshPlayer();
        const now = (fresh?.title ?? null) === (wearing ? null : selected.rewards.title);
        setMessage(now ? 'Profile title updated.' : 'Could not update your title. Try again.');
      } catch {
        setMessage('Not sure that saved. Reopen your profile to check.');
      }
    } finally {
      setEquipping(false);
    }
  }, [selected, equipping, previewMode, player?.title, refreshPlayer]);

  const pick = useCallback((key: string) => {
    if (key === filter) return;
    playSfx('ui.select', 0.7);
    haptic('tickSelection');
    setFilter(key);
    scroller.current?.scrollTo({ y: 0, animated: !reducedMotion });
  }, [filter, reducedMotion]);

  const animateTiles = focused && !selected;

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>Stamp Book</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>

      <View style={styles.page}>
        <LinearGradient colors={['#05346e', '#0a428a', '#062c5c']} style={StyleSheet.absoluteFill} />

        {status !== 'ready' ? (
          <View style={styles.state}>
            <Text style={styles.stateText}>{status === 'loading' ? 'Opening your Stamp Book...' : 'Your Stamp Book could not load.'}</Text>
            {status === 'error' && (
              <Pressable onPress={() => setReloadKey(k => k + 1)} style={styles.retry}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            )}
          </View>
        ) : (
          <ScrollView ref={scroller} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}
            stickyHeaderIndices={[1]}>
            <Hero earned={totals.earned} total={totals.total} toClaim={totals.toClaim} />

            <View style={styles.tabsWrap}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
                <Tab label="All" color="#FFFFFF" active={filter === 'all'} count={`${totals.earned}/${totals.total}`} onPress={() => pick('all')} />
                {sections.map(section => (
                  <Tab key={section.key} label={section.label} color={section.color} active={filter === section.key}
                    count={`${section.earned}/${section.total}`} onPress={() => pick(section.key)} />
                ))}
              </ScrollView>
            </View>

            {sections.length === 0 && <Text style={styles.stateText}>No stamps yet. Check back soon.</Text>}

            {shown.map(section => (
              <SectionBlock key={section.key} section={section} tile={tile} animate={animateTiles}
                reducedMotion={reducedMotion} onOpen={open} />
            ))}
            <View style={{ height: 40 }} />
          </ScrollView>
        )}
      </View>

      <StampCard
        stamp={selected}
        accent={selected ? accentFor(selected.section) : '#2F6BFF'}
        reducedMotion={reducedMotion}
        claiming={claiming}
        equipping={equipping}
        message={message}
        wearingTitle={!!selected?.rewards.title && player?.title === selected.rewards.title}
        onClaim={claim}
        onToggleTitle={toggleTitle}
        onClose={() => { playSfx('ui.modalClose', 0.6); setSelected(null); }}
        slamKey={slamKey}
      />
    </Wrapper>
  );
}

function Hero({ earned, total, toClaim }: { earned: number; total: number; toClaim: number }) {
  const R = 38;
  const { circumference, offset } = ring(total > 0 ? earned / total : 0, R);
  return (
    <View style={styles.hero}>
      <View style={styles.heroRing}>
        <Svg width={96} height={96} viewBox="0 0 96 96">
          <Circle cx={48} cy={48} r={R} stroke="rgba(255,255,255,0.14)" strokeWidth={10} fill="none" />
          <Circle cx={48} cy={48} r={R} stroke="#FFC93C" strokeWidth={10} fill="none" strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={offset} rotation={-90} origin="48, 48" />
        </Svg>
        <View style={styles.heroCount}>
          <Text style={styles.heroNum}>{earned}</Text>
          <Text style={styles.heroOf}>of {total}</Text>
        </View>
      </View>
      <View style={styles.heroText}>
        <Text style={styles.heroTitle}>My Passport</Text>
        <Text style={styles.heroSub}>Every stamp is something you did. Tap one to see it up close.</Text>
        {toClaim > 0 && (
          <View style={styles.heroClaim}>
            <Text style={styles.heroClaimText}>{toClaim} {toClaim === 1 ? 'stamp has' : 'stamps have'} rewards to claim</Text>
          </View>
        )}
      </View>
    </View>
  );
}

function Tab({ label, color, active, count, onPress }: { label: string; color: string; active: boolean; count: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected: active }}
      style={[styles.tab, active && { backgroundColor: color, borderColor: color }]}>
      <View style={[styles.tabDot, { backgroundColor: active ? INK : color }]} />
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      <Text style={[styles.tabCount, active && styles.tabTextActive]}>{count}</Text>
    </Pressable>
  );
}

function SectionBlock({ section, tile, animate, reducedMotion, onOpen }: {
  section: BookSection; tile: number; animate: boolean; reducedMotion: boolean; onOpen: (s: BookStamp) => void;
}) {
  const pct = section.total > 0 ? Math.round((section.earned / section.total) * 100) : 0;
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={[styles.sectionBadge, { backgroundColor: section.color }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.sectionTitle}>{section.label}</Text>
          <Text style={styles.sectionBlurb}>{section.blurb}</Text>
        </View>
        <Text style={[styles.sectionCount, { color: section.color }]}>{section.earned}/{section.total}</Text>
      </View>
      <View style={styles.sectionBar}><View style={[styles.sectionFill, { width: `${pct}%`, backgroundColor: section.color }]} /></View>
      <View style={styles.grid}>
        {section.stamps.map(stamp => (
          <StampTile key={stamp.id} stamp={stamp} size={tile} accent={section.color} animate={animate}
            reducedMotion={reducedMotion} onPress={onOpen} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, overflow: 'hidden' },
  scroll: { paddingTop: 14 },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  stateText: { color: '#E8EEFF', fontFamily: 'Knockout', fontSize: 17, textAlign: 'center', paddingHorizontal: 24 },
  retry: { marginTop: 14, borderRadius: 14, backgroundColor: '#FFC93C', paddingHorizontal: 22, paddingVertical: 11, borderWidth: 3, borderColor: INK },
  retryText: { color: INK, fontFamily: 'Knockout', fontSize: 16 },

  hero: {
    flexDirection: 'row', alignItems: 'center', marginHorizontal: SIDE, padding: 14, borderRadius: 24,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)',
  },
  heroRing: { width: 96, height: 96, alignItems: 'center', justifyContent: 'center' },
  heroCount: { position: 'absolute', alignItems: 'center' },
  heroNum: { fontFamily: 'Shark', fontSize: 30, color: '#FFFFFF', lineHeight: 32 },
  heroOf: { fontFamily: 'Knockout', fontSize: 12, color: 'rgba(232,238,255,0.75)' },
  heroText: { flex: 1, marginLeft: 14 },
  heroTitle: { fontFamily: 'Shark', fontSize: 26, color: '#FFFFFF', textTransform: 'uppercase' },
  heroSub: { fontFamily: 'Knockout', fontSize: 13, lineHeight: 17, color: 'rgba(232,238,255,0.78)', marginTop: 2 },
  heroClaim: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: '#FFC93C', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 2, borderColor: INK },
  heroClaimText: { fontFamily: 'Knockout', fontSize: 13, color: INK },

  tabsWrap: { backgroundColor: '#05346e', paddingVertical: 10 },
  tabs: { paddingHorizontal: SIDE, gap: 8 },
  tab: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.08)', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.14)',
  },
  tabDot: { width: 9, height: 9, borderRadius: 5 },
  tabText: { fontFamily: 'Knockout', fontSize: 15, color: '#E8EEFF' },
  tabCount: { fontFamily: 'Knockout', fontSize: 13, color: 'rgba(232,238,255,0.65)' },
  tabTextActive: { color: INK },

  section: { marginTop: 14, paddingHorizontal: SIDE },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionBadge: { width: 8, height: 34, borderRadius: 4 },
  sectionTitle: { fontFamily: 'Shark', fontSize: 21, color: '#FFFFFF', textTransform: 'uppercase' },
  sectionBlurb: { fontFamily: 'Knockout', fontSize: 13, color: 'rgba(232,238,255,0.7)' },
  sectionCount: { fontFamily: 'Shark', fontSize: 20 },
  sectionBar: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.12)', marginTop: 8, marginBottom: 12, overflow: 'hidden' },
  sectionFill: { height: '100%', borderRadius: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
});
