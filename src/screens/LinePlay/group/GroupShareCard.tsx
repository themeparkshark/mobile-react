/**
 * The crew recap Story card (L3), in the park-day card's style: 9:16, his
 * water background, the TPS logo, rendered off-screen and captured at
 * 1080x1920. No ride names, logos or park art on a shared image (BEST_IN_LINE
 * 17); the coin art is our own. Shared only by the player, never auto-posted.
 */
import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import ShareCardArtwork from '../../../components/ShareCardArtwork';
import { SHARE_CARD_HEIGHT, SHARE_CARD_WIDTH } from '../../../components/ParkDayShareCard';
import type { GroupRecap } from '../../../services/lineplay/lineGroup';
import PlayerBadge from './PlayerBadge';
import { GameIcon } from '../../../ui';

export interface GroupShareCardProps {
  readonly recap: GroupRecap;
  readonly seats: Readonly<Record<string, number>>;
  readonly waitLine: string;
  readonly partsEarned: number | null;
  readonly coin: { readonly url: string; readonly level: number; readonly maxLevel: number } | null;
  readonly dateLabel: string;
  readonly onReadyChange?: (ready: boolean) => void;
}

/** Up to 6 rows of stars: a crew's whole wait in one glance. */
const GroupShareCard = forwardRef<View, GroupShareCardProps>(function GroupShareCard(
  { recap, seats, waitLine, partsEarned, coin, dateLabel, onReadyChange }, ref) {
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set());
  const required = useMemo(() => ['background', 'logo', 'crew', ...(coin ? [`coin:${coin.url}`] : [])], [coin?.url]);
  const markReady = useCallback((key: string) => setLoaded(previous =>
    previous.has(key) ? previous : new Set([...previous, key])), []);
  const ready = required.every(key => loaded.has(key));
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  const champion = recap.champions.length === 1 ? recap.champions[0].name : null;

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <ShareCardArtwork artworkKey="background" onReady={markReady}
        source={require('../../../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />
      <ShareCardArtwork artworkKey="logo" onReady={markReady}
        source={require('../../../../assets/images/screens/login/logo.png')} style={styles.logo} contentFit="contain" />

      <View style={styles.hero}>
        <ShareCardArtwork artworkKey="crew" onReady={markReady}
          source={require('../../../../assets/images/screens/lineplay/line-crew-sharks.png')} style={styles.crew} contentFit="contain" />
        <View style={styles.heroCopy}>
          <Text style={styles.kicker}>OUR LINE CREW</Text>
          <Text style={styles.headline} numberOfLines={3} adjustsFontSizeToFit minimumFontScale={0.7}>
            {champion ? `${champion} wins the line!` : recap.headline}
          </Text>
          <Text style={styles.date}>{dateLabel}</Text>
        </View>
      </View>

      <View style={styles.board}>
        {recap.standings.slice(0, 6).map(row => <View key={row.player.id} style={styles.row}>
          <Text style={styles.place}>{row.place}</Text>
          <PlayerBadge name={row.player.name} index={seats[row.player.id] ?? 0} size={34} kid={row.player.kid} />
          <View style={styles.rowCopy}>
            <Text style={styles.rowName} numberOfLines={1}>{row.player.name}</Text>
            <Text style={styles.rowAward} numberOfLines={1}>{row.award}</Text>
          </View>
          <View style={styles.rowStars}>
            <GameIcon name="star" size={22} />
            <Text style={styles.rowTotal}>{row.stars}</Text>
          </View>
        </View>)}
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statValue}>{recap.roundsPlayed}</Text>
          <Text style={styles.statLabel}>{recap.roundsPlayed === 1 ? 'round' : 'rounds'}</Text>
        </View>
        {partsEarned != null && partsEarned > 0 && <View style={styles.stat}>
          <Text style={styles.statValue}>{partsEarned}</Text>
          <Text style={styles.statLabel}>Ride Parts</Text>
        </View>}
        {coin && <View style={styles.stat}>
          <ShareCardArtwork key={coin.url} artworkKey={`coin:${coin.url}`} onReady={markReady}
            fallback={require('../../../../assets/images/coingold.png')} source={{ uri: coin.url }}
            style={styles.coin} contentFit="contain" />
          <Text style={styles.statLabel}>Lv {coin.level}/{coin.maxLevel}</Text>
        </View>}
      </View>
      <Text style={styles.wait}>{waitLine}</Text>

      <View style={styles.footer}>
        <Text style={styles.cta}>Play your next line with us!</Text>
        <Text style={styles.handle}>Theme Park Shark app · @themeparkshark</Text>
      </View>
    </View>
  );
});

export default GroupShareCard;

const styles = StyleSheet.create({
  card: { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, overflow: 'hidden', backgroundColor: '#0768b9',
    paddingHorizontal: 18, paddingTop: 28, paddingBottom: 22, justifyContent: 'space-between' },
  tint: { backgroundColor: 'rgba(5, 52, 110, 0.25)' },
  logo: { width: '100%', height: 64 },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  crew: { width: 132, height: 118 },
  heroCopy: { flex: 1 },
  kicker: { fontFamily: 'Knockout', fontSize: 14, color: '#cdeaff', letterSpacing: 1 },
  headline: { fontFamily: 'Shark', fontSize: 26, lineHeight: 30, color: '#ffcf3b',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0 },
  date: { fontFamily: 'Knockout', fontSize: 14, color: '#fff', marginTop: 2 },
  board: { backgroundColor: 'rgba(3, 32, 71, 0.55)', borderRadius: 20, borderWidth: 3, borderColor: '#fff',
    paddingVertical: 8, paddingHorizontal: 10, gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  place: { width: 18, fontFamily: 'Shark', fontSize: 18, color: '#ffcf3b', textAlign: 'center' },
  rowCopy: { flex: 1 },
  rowName: { fontFamily: 'Shark', fontSize: 17, color: '#fff' },
  rowAward: { fontFamily: 'Knockout', fontSize: 13, color: '#cdeaff' },
  rowStars: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  rowTotal: { fontFamily: 'Shark', fontSize: 20, color: '#fff', minWidth: 22, textAlign: 'right' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  stat: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 64,
    backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 6 },
  statValue: { fontFamily: 'Shark', fontSize: 26, color: '#fff' },
  statLabel: { fontFamily: 'Knockout', fontSize: 13, color: '#cdeaff' },
  coin: { width: 38, height: 38 },
  wait: { fontFamily: 'Shark', fontSize: 17, color: '#fff', textAlign: 'center' },
  footer: { alignItems: 'center' },
  cta: { fontFamily: 'Shark', fontSize: 21, color: '#ffcf3b',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  handle: { fontFamily: 'Knockout', fontSize: 14, color: '#fff', marginTop: 2 },
});
