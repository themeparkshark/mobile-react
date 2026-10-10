/**
 * A friend's Stamp Book (read only). Opened from a friend's profile; the
 * server answers friends only (GET /players/{id}/stamps) and never sends
 * progress on unearned stamps or anything secret. Same look as your own book:
 * the lagoon, the cover (stamps, worn title under the shark, rarest stamp in
 * its rarity frame) and paper pages with their stamps printed on.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Image } from 'expo-image';
import { useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { getFriendStamps, type FriendBook, type FriendStamp } from '../api/endpoints/me/stamps';
import GameIcon from '../ui/GameIcon';
import { stampRarity } from './stampbook/rarity';
import { INK, MUTED_INK, PAPER, SLOT, SLOT_EDGE, tiltFor } from './stampbook/StampTile';

const BACKGROUND = require('../../assets/images/screens/leaderboard/standings-bg.png');
const SHARK = require('../../assets/images/howto/shark-happy.webp');
const FALLBACK = require('../../assets/images/stamps/stamp-fallback.png');

export default function FriendStampBookScreen() {
  const { playerId, name } = (useRoute().params ?? {}) as { playerId?: number; name?: string };
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [book, setBook] = useState<FriendBook | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'closed' | 'error'>('loading');

  useEffect(() => {
    // Dev captures only (constant-folded out of release): a friend's book built from the Stamp Book preview data.
    if (__DEV__ && process.env.EXPO_PUBLIC_FRIEND_BOOK_PREVIEW === '1') {
      const { PREVIEW_BOOK } = require('./stampbook/preview');
      const { buildBook } = require('./stampbook/model');
      const sections = buildBook(PREVIEW_BOOK);
      const rank: Record<string, number> = { common: 1, uncommon: 2, rare: 3, epic: 4, legendary: 5 };
      const stamps: FriendStamp[] = sections.flatMap((s: { stamps: { earned: boolean; id: number; slug: string; name: string; shortName: string; rarity: FriendStamp['rarity']; section: string; thumbUrl: string | null; earnedAt: string | null }[] }) =>
        s.stamps.filter(x => x.earned).map(x => ({ id: x.id, slug: x.slug, name: x.name, short_name: x.shortName, rarity: x.rarity, section: x.section,
          icon_thumb_url: process.env.EXPO_PUBLIC_STAMP_ART_BASE ? `${process.env.EXPO_PUBLIC_STAMP_ART_BASE}/${x.slug}@thumb.png` : null, earned_at: x.earnedAt })))
        .sort((a: FriendStamp, b: FriendStamp) => rank[b.rarity] - rank[a.rarity]);
      setBook({ player: { id: 2, username: 'CoasterKid', title: 'Wild Legend' }, stamps, rarest: stamps[0] ?? null,
        sections: sections.map((s: { key: string; label: string; color: string; blurb: string; earned: number; total: number }) => ({ key: s.key, label: s.label, color: s.color, blurb: s.blurb, earned: s.earned, total: s.total })),
        summary: { earned: stamps.length, total: sections.reduce((n: number, s: { total: number }) => n + s.total, 0) } });
      setState('ready');
      return;
    }
    if (!playerId) { setState('error'); return; }
    let live = true;
    getFriendStamps(playerId)
      .then(data => { if (live) { setBook(data); setState('ready'); } })
      .catch((e: { response?: { status?: number } }) => { if (live) setState(e?.response?.status === 403 ? 'closed' : 'error'); });
    return () => { live = false; };
  }, [playerId]);

  const who = book?.player.username || name || 'Friend';
  const tile = Math.floor((width - 24 - 16 - 30 - 18) / 4);

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>Stamp Book</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <View style={styles.screen}>
        <Image source={BACKGROUND} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" />
        {state !== 'ready' || !book ? (
          <View style={styles.state}>
            <Text style={styles.stateText} maxFontSizeMultiplier={1.4}>
              {state === 'loading' ? 'Opening the Stamp Book...' : state === 'closed' ? 'Only friends can open this Stamp Book.' : 'This Stamp Book could not load.'}
            </Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={{ paddingTop: 12, paddingBottom: 150 + insets.bottom }} showsVerticalScrollIndicator={false}>
            <View style={styles.coverWrap}>
              <View style={styles.coverLip} />
              <View style={styles.cover}>
                <View style={styles.stitch} pointerEvents="none" />
                <View style={styles.coverTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.coverName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.3}>{who}</Text>
                    <Text style={styles.coverCount} maxFontSizeMultiplier={1.4}>{book.summary.earned} of {book.summary.total} stamps</Text>
                  </View>
                  <View style={styles.sharkTitle} accessible accessibilityLabel={book.player.title ? `Title: ${book.player.title}` : 'No title'}>
                    <Image source={SHARK} style={styles.shark} contentFit="contain" />
                    {!!book.player.title && (
                      <View style={styles.titlePill}>
                        <GameIcon name="crown" size={16} />
                        <Text style={styles.titleText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} maxFontSizeMultiplier={1.2}>{book.player.title}</Text>
                      </View>
                    )}
                  </View>
                </View>
                {!!book.rarest && <Rarest stamp={book.rarest} />}
              </View>
            </View>

            <View style={styles.board}>
              {book.sections.filter(s => s.total > 0 || s.earned > 0).map(section => {
                const owned = book.stamps.filter(s => s.section === section.key);
                const missing = Math.max(0, section.total - section.earned);
                return (
                  <View key={section.key} style={styles.page}>
                    <View style={styles.pageHead}>
                      <View style={[styles.dot, { backgroundColor: section.color }]} />
                      <Text style={styles.pageTitle} maxFontSizeMultiplier={1.3}>{section.label}</Text>
                      <Text style={styles.pageCount} maxFontSizeMultiplier={1.3}>{section.earned} / {section.total}</Text>
                      {section.total > 0 && section.earned >= section.total && (
                        <View style={styles.seal} accessible accessibilityLabel="Page complete"><GameIcon name="check" size={16} /></View>
                      )}
                    </View>
                    <View style={styles.grid}>
                      {owned.map(s => <Owned key={s.id} stamp={s} size={tile} />)}
                      {/* Not yet: plain empty slots, never the stamp's name or how to get it. */}
                      {Array.from({ length: Math.min(missing, 8) }, (_, i) => (
                        <View key={`m${i}`} style={[styles.slot, { width: tile, height: tile }]} accessible={false} />
                      ))}
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        )}
      </View>
    </Wrapper>
  );
}

function Owned({ stamp, size }: { stamp: FriendStamp; size: number }) {
  const look = stampRarity(stamp.rarity);
  return (
    <View style={{ width: size, alignItems: 'center' }} accessible accessibilityLabel={`${stamp.name}, ${look.label}`}>
      <View style={[styles.owned, { width: size, height: size, borderColor: look.frame, transform: [{ rotate: `${tiltFor(stamp.id)}deg` }] }]}>
        <Image source={stamp.icon_thumb_url ? { uri: stamp.icon_thumb_url, cacheKey: stamp.icon_thumb_url } : FALLBACK} style={StyleSheet.absoluteFill} contentFit="contain" />
      </View>
      <Text style={styles.ownedName} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.1}>{stamp.short_name}</Text>
    </View>
  );
}

function Rarest({ stamp }: { stamp: FriendStamp }) {
  const look = stampRarity(stamp.rarity);
  return (
    <View style={styles.showcase} accessible accessibilityLabel={`Rarest stamp: ${stamp.name}, ${look.label}`}>
      <View style={[styles.showcaseArt, { borderColor: look.frame }]}>
        <Image source={stamp.icon_thumb_url ? { uri: stamp.icon_thumb_url, cacheKey: stamp.icon_thumb_url } : FALLBACK} style={StyleSheet.absoluteFill} contentFit="contain" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.showcaseLabel} maxFontSizeMultiplier={1.3}>RAREST STAMP</Text>
        <Text style={styles.showcaseName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3}>{stamp.short_name}</Text>
      </View>
      <View style={[styles.pill, { backgroundColor: look.chip, borderColor: look.frame }]}>
        <Text style={styles.pillText} maxFontSizeMultiplier={1.2}>{look.label.toUpperCase()}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden', backgroundColor: '#0a77bf' },
  state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  stateText: { color: '#FFFFFF', fontFamily: 'Shark', fontSize: 18, textAlign: 'center', textShadowColor: '#05346e', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 0 },
  coverWrap: { marginHorizontal: 12 },
  coverLip: { position: 'absolute', left: 0, right: 0, top: 8, bottom: -6, borderRadius: 24, backgroundColor: '#03417A' },
  cover: { padding: 14, borderRadius: 24, backgroundColor: '#0A6FB8', borderWidth: 3, borderColor: '#0B3E78', gap: 10 },
  stitch: { position: 'absolute', left: 7, right: 7, top: 7, bottom: 7, borderRadius: 18, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,214,102,0.75)' },
  coverTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  coverName: { fontFamily: 'Shark', fontSize: 24, color: '#FFFFFF', textTransform: 'uppercase', textShadowColor: '#05346e', textShadowOffset: { width: 2, height: 2 }, textShadowRadius: 0 },
  coverCount: { fontFamily: 'Shark', fontSize: 16, color: '#FFCF3B' },
  sharkTitle: { alignItems: 'center', width: 120 },
  shark: { width: 58, height: 62, marginBottom: -12 },
  titlePill: {
    maxWidth: 120, flexDirection: 'row', alignItems: 'center', gap: 3, minHeight: 30, backgroundColor: '#FFCF3B', borderRadius: 15,
    paddingHorizontal: 8, borderWidth: 2, borderColor: '#FFFFFF', borderBottomWidth: 4, borderBottomColor: '#D99A00',
  },
  titleText: { flexShrink: 1, fontFamily: 'Shark', fontSize: 14, color: INK },
  showcase: {
    flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(0,40,90,0.35)', borderRadius: 16, padding: 8,
    borderWidth: 2, borderColor: 'rgba(255,214,102,0.7)',
  },
  showcaseArt: { width: 46, height: 46, borderRadius: 23, borderWidth: 3, backgroundColor: PAPER },
  showcaseLabel: { fontFamily: 'Shark', fontSize: 12, color: '#FFCF3B', letterSpacing: 1 },
  showcaseName: { fontFamily: 'Shark', fontSize: 17, color: '#FFFFFF' },
  pill: { borderRadius: 12, borderWidth: 2, paddingHorizontal: 10, paddingVertical: 3 },
  pillText: { fontFamily: 'Shark', fontSize: 13, color: '#05346e' },
  board: { marginHorizontal: 0, marginTop: 14, padding: 8, gap: 12, borderRadius: 28, backgroundColor: '#0A6FB8', borderWidth: 3, borderColor: '#0B3E78' },
  page: { borderRadius: 22, backgroundColor: PAPER, borderWidth: 3, borderColor: '#FFFFFF', padding: 12, gap: 10 },
  pageHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2.5, borderColor: '#FFFFFF' },
  pageTitle: { flex: 1, fontFamily: 'Shark', fontSize: 19, color: INK, textTransform: 'uppercase' },
  pageCount: { fontFamily: 'Shark', fontSize: 16, color: MUTED_INK },
  seal: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#FFC21A', borderWidth: 2.5, borderColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  owned: { borderRadius: 999, borderWidth: 3, padding: 3 },
  ownedName: { fontFamily: 'Shark', fontSize: 12, color: INK, textAlign: 'center', marginTop: 3, textTransform: 'uppercase' },
  slot: { borderRadius: 999, borderWidth: 2.5, borderStyle: 'dashed', borderColor: SLOT_EDGE, backgroundColor: SLOT },
});
