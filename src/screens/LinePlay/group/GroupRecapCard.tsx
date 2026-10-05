/**
 * Crew recap at boarding (L3): who did best, the coin this wait fed, and the
 * real wait vs the sign. It sits inside the queue recap and shows only
 * server-confirmed Parts; a crew never earns more than the same wait solo.
 */
import { shareFileExternal } from '../../../services/external';
import { useCallback, useRef, useState } from 'react';
import { PixelRatio, Platform, StyleSheet, Text, View } from 'react-native';
import { captureRef } from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import Animated, { FadeInDown } from 'react-native-reanimated';
import useReducedGameMotion from '../../../hooks/useReducedGameMotion';
import { BRAND, GameButton, GameIcon, SHADOW, gameAlert } from '../../../ui';
import { groupRecap, waitLine, type LineGroup } from '../../../services/lineplay/lineGroup';
import { parkDayCaptureSize } from '../../../components/parkDayShareMetrics';
import { FLEX_SIZE } from '../../../share/formats';
import type { RideCoinLevelType } from '../../../models/ride-coin-level-type';
import PlayerBadge from './PlayerBadge';
import GroupShareCard from './GroupShareCard';

const { width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT } = FLEX_SIZE.story;

export function seatMap(group: LineGroup): Record<string, number> {
  return Object.fromEntries(group.players.map((player, index) => [player.id, index]));
}

export function coinLine(partsEarned: number | null, rewardsConfirmed: boolean,
  coin: Pick<RideCoinLevelType, 'current_level' | 'max_level'> | null): string {
  if (!rewardsConfirmed) return 'Ride Parts land on this coin when your wait syncs.';
  const level = coin ? ` Coin level ${coin.current_level}/${coin.max_level}.` : '';
  if (!partsEarned) return `Every round fed this ride's coin.${level}`;
  return `Your crew's wait earned ${partsEarned} Ride Part${partsEarned === 1 ? '' : 's'} for this coin.${level}`;
}

export default function GroupRecapCard({ group, realMinutes, postedMinutes, partsEarned, rewardsConfirmed, coin }: {
  readonly group: LineGroup;
  readonly realMinutes: number;
  /** Only when the wait came from the board; estimates are not "the sign". */
  readonly postedMinutes: number | null;
  readonly partsEarned: number | null;
  readonly rewardsConfirmed: boolean;
  readonly coin: RideCoinLevelType | null;
}) {
  const reducedMotion = useReducedGameMotion();
  const shareRef = useRef<View>(null);
  const busy = useRef(false);
  const [sharing, setSharing] = useState(false);
  const [artReady, setArtReady] = useState(false);
  const onReadyChange = useCallback((ready: boolean) => setArtReady(ready), []);
  const recap = groupRecap(group);
  if (!recap) return null;
  const seats = seatMap(group);
  const wait = waitLine(realMinutes, postedMinutes);

  const share = async () => {
    if (busy.current || !shareRef.current || !artReady) return;
    busy.current = true;
    setSharing(true);
    try {
      if (!await Sharing.isAvailableAsync()) {
        gameAlert('Sharing unavailable', 'This device cannot open a share sheet right now.');
        return;
      }
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const uri = await captureRef(shareRef, { format: 'jpg', quality: 0.92, ...parkDayCaptureSize(Platform.OS, PixelRatio.get()) });
      await shareFileExternal(uri, { mimeType: 'image/jpeg', UTI: 'public.jpeg', dialogTitle: 'Share your line crew' });
    } catch {
      gameAlert('Card not made', 'Your crew results are saved. Try sharing again.', undefined, { icon: 'retry' });
    } finally {
      busy.current = false;
      setSharing(false);
    }
  };

  return (
    <Animated.View entering={reducedMotion ? undefined : FadeInDown.delay(240).springify().damping(14)} style={styles.card}>
      <Text style={styles.kicker}>CREW RECAP · {recap.roundsPlayed} {recap.roundsPlayed === 1 ? 'ROUND' : 'ROUNDS'}</Text>
      <View style={styles.headlineRow}>
        <GameIcon name="crown" size={34} />
        <Text style={styles.headline} accessibilityRole="header">{recap.headline}</Text>
      </View>
      {recap.standings.map(row => <View key={row.player.id} style={[styles.row, row.place === 1 && row.turns > 0 && styles.rowFirst]}
        accessible accessibilityLabel={`${row.place}. ${row.player.name}, ${row.award}, ${row.stars} stars`}>
        <Text style={styles.place}>{row.place}</Text>
        <PlayerBadge name={row.player.name} index={seats[row.player.id] ?? 0} size={34} kid={row.player.kid} />
        <View style={styles.rowCopy}>
          <Text style={styles.name} numberOfLines={1}>{row.player.name}</Text>
          <Text style={styles.award} numberOfLines={1}>
            {row.award}{row.roundWins > 0 ? ` · ${row.roundWins} round${row.roundWins === 1 ? '' : 's'} won` : ''}
          </Text>
        </View>
        <GameIcon name="star" size={22} />
        <Text style={styles.total}>{row.stars}</Text>
      </View>)}
      <View style={styles.infoRow}>
        <GameIcon name="parts" size={26} />
        <Text style={styles.info}>{coinLine(partsEarned, rewardsConfirmed, coin)}</Text>
      </View>
      <View style={styles.infoRow}>
        <GameIcon name="timer" size={26} />
        <Text style={styles.info}>{wait}</Text>
      </View>
      <GameButton label={sharing ? 'Making your card...' : artReady ? 'Share crew card' : 'Preparing card...'}
        icon="camera" onPress={() => void share()} disabled={sharing || !artReady} loading={sharing}
        accessibilityLabel="Share your crew recap as an image" />
      <View style={styles.offscreen} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <GroupShareCard ref={shareRef} recap={recap} seats={seats} waitLine={wait}
          partsEarned={rewardsConfirmed ? partsEarned : null}
          coin={coin ? { url: coin.coin_url, level: coin.current_level, maxLevel: coin.max_level } : null}
          dateLabel={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          onReadyChange={onReadyChange} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: 14, backgroundColor: BRAND.cream, borderRadius: 24, borderWidth: 3, borderColor: BRAND.navy,
    padding: 14, gap: 6, ...SHADOW.card },
  kicker: { color: BRAND.blueBright, fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1 },
  headlineRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  headline: { flex: 1, color: BRAND.navy, fontFamily: 'Shark', fontSize: 21, lineHeight: 25 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: BRAND.white, borderRadius: 14,
    paddingHorizontal: 8, paddingVertical: 6 },
  rowFirst: { backgroundColor: BRAND.goldLight },
  place: { width: 18, color: BRAND.navy, fontFamily: 'Shark', fontSize: 18, textAlign: 'center' },
  rowCopy: { flex: 1 },
  name: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 17 },
  award: { color: BRAND.navySoft, fontFamily: 'Knockout', fontSize: 14 },
  total: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 19, minWidth: 22, textAlign: 'right' },
  infoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  info: { flex: 1, color: BRAND.navy, fontFamily: 'Knockout', fontSize: 16, lineHeight: 20 },
  offscreen: { position: 'absolute', left: -2000, top: 0, width: SHARE_CARD_WIDTH, height: SHARE_CARD_HEIGHT },
});
