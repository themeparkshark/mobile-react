import { forwardRef, useCallback, useEffect, useMemo, useState } from 'react';
import ShareCardArtwork from './ShareCardArtwork';
import { StyleSheet, Text, View } from 'react-native';
import type { ParkDayRecap } from '../api/endpoints/me/park-day-recap';

export const SHARE_CARD_WIDTH = 360;
export const SHARE_CARD_HEIGHT = 640; // 9:16, captured at 3x = 1080x1920 for Stories

/**
 * The park-day brag card: one glance says where you went and what you caught,
 * like a Wordle grid for a theme park day. Rendered off-screen and captured.
 */
const ParkDayShareCard = forwardRef<View, {
  readonly recap: ParkDayRecap;
  readonly sharkName?: string | null;
  readonly avatarUrl?: string | null;
  readonly onReadyChange?: (ready: boolean) => void;
}>(function ParkDayShareCard({ recap, sharkName, avatarUrl, onReadyChange }, ref) {
  const coins = recap.coins ?? [];
  const shown = coins.slice(0, 12);
  const extra = coins.length - shown.length;
  const [loadedArtwork, setLoadedArtwork] = useState<ReadonlySet<string>>(() => new Set());
  const requiredArtwork = useMemo(() => [
    'background', 'logo', `avatar:${avatarUrl ?? 'default'}`,
    ...coins.slice(0, 12).map(coin => `coin:${coin.coin_url ?? 'default'}`),
  ], [avatarUrl, coins]);
  const markReady = useCallback((key: string) => setLoadedArtwork(previous =>
    previous.has(key) ? previous : new Set([...previous, key])), []);
  const ready = requiredArtwork.every(key => loadedArtwork.has(key));
  useEffect(() => { onReadyChange?.(ready); }, [ready, onReadyChange]);
  const date = new Date(`${recap.park_day}T12:00:00`).toLocaleDateString('en-US',
    { weekday: 'long', month: 'long', day: 'numeric' });
  const coinSize = shown.length <= 4 ? 72 : shown.length <= 9 ? 58 : 50;

  return (
    <View ref={ref} collapsable={false} style={styles.card}>
      <ShareCardArtwork artworkKey="background" onReady={markReady} source={require('../../assets/images/water_background.png')} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, styles.tint]} />

      <ShareCardArtwork artworkKey="logo" onReady={markReady} source={require('../../assets/images/screens/login/logo.png')} style={styles.logo} contentFit="contain" />

      <View style={styles.who}>
        {avatarUrl
          ? <ShareCardArtwork key={avatarUrl} artworkKey={`avatar:${avatarUrl}`} onReady={markReady}
            fallback={require('../../assets/images/screens/welcome/shark.png')} source={{ uri: avatarUrl }} style={styles.avatar} contentFit="cover" />
          : <ShareCardArtwork artworkKey="avatar:default" onReady={markReady} source={require('../../assets/images/screens/welcome/shark.png')} style={styles.avatar} contentFit="contain" />}
        <View style={{ flex: 1 }}>
          {!!sharkName && <Text style={styles.name} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{sharkName}</Text>}
          <Text style={styles.park} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.85}>{recap.park_name}</Text>
          <Text style={styles.date}>{date}</Text>
        </View>
      </View>

      <View style={styles.coinPanel}>
        <Text style={styles.bigNumber}>{recap.distinct_rides_won}</Text>
        <Text style={styles.bigLabel}>{recap.distinct_rides_won === 1 ? 'RIDE COIN CAUGHT' : 'RIDE COINS CAUGHT'}</Text>
        <View style={styles.grid}>
          {shown.map(coin => (
            <View key={coin.asset_id} style={{ alignItems: 'center' }}>
              {coin.coin_url
                ? <ShareCardArtwork key={coin.coin_url} artworkKey={`coin:${coin.coin_url}`} onReady={markReady}
                    fallback={require('../../assets/images/coingold.png')} source={{ uri: coin.coin_url }} style={{ width: coinSize, height: coinSize }} contentFit="contain" />
                : <ShareCardArtwork artworkKey="coin:default" onReady={markReady} source={require('../../assets/images/coingold.png')} style={{ width: coinSize, height: coinSize }} contentFit="contain" />}
              {coin.new && <Text style={styles.newTag}>NEW</Text>}
            </View>
          ))}
          {extra > 0 && <View style={[styles.more, { width: coinSize, height: coinSize, borderRadius: coinSize / 2 }]}>
            <Text style={styles.moreText}>+{extra}</Text>
          </View>}
        </View>
      </View>

      <View style={styles.stats}>
        <Stat value={recap.eligible_line_minutes} label="verified min" />
        <Stat value={recap.ride_parts_earned} label="Ride Parts" />
        <Stat value={recap.coin_upgrades} label="upgrades" />
      </View>

      <View style={styles.footer}>
        <Text style={styles.cta}>Catch the coins I missed!</Text>
        <Text style={styles.handle}>Theme Park Shark app · @themeparkshark</Text>
      </View>
    </View>
  );
});

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default ParkDayShareCard;

const styles = StyleSheet.create({
  card: { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT, overflow: 'hidden', backgroundColor: '#0768b9',
    paddingHorizontal: 20, paddingTop: 34, paddingBottom: 26, justifyContent: 'space-between' },
  tint: { backgroundColor: 'rgba(5, 52, 110, 0.25)' },
  logo: { width: '100%', height: 80 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 18, padding: 10 },
  avatar: { width: 64, height: 72, borderRadius: 12 },
  name: { fontFamily: 'Shark', fontSize: 22, color: '#ffcf3b' },
  park: { fontFamily: 'Shark', fontSize: 17, color: '#fff' },
  date: { fontFamily: 'Knockout', fontSize: 14, color: '#cdeaff' },
  coinPanel: { alignItems: 'center', backgroundColor: 'rgba(3, 32, 71, 0.55)', borderRadius: 22,
    borderWidth: 3, borderColor: '#fff', paddingVertical: 14, paddingHorizontal: 10 },
  bigNumber: { fontFamily: 'Shark', fontSize: 64, lineHeight: 70, color: '#ffcf3b',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  bigLabel: { fontFamily: 'Shark', fontSize: 20, color: '#fff', marginBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  newTag: { fontFamily: 'Knockout', fontSize: 11, color: '#7dffb0', marginTop: -2 },
  more: { backgroundColor: 'rgba(255,255,255,0.2)', justifyContent: 'center', alignItems: 'center' },
  moreText: { fontFamily: 'Shark', fontSize: 20, color: '#fff' },
  stats: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  stat: { flex: 1, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 14, paddingVertical: 8 },
  statValue: { fontFamily: 'Shark', fontSize: 26, color: '#fff' },
  statLabel: { fontFamily: 'Knockout', fontSize: 13, color: '#cdeaff' },
  footer: { alignItems: 'center' },
  cta: { fontFamily: 'Shark', fontSize: 22, color: '#ffcf3b',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  handle: { fontFamily: 'Knockout', fontSize: 14, color: '#fff', marginTop: 2 },
});
