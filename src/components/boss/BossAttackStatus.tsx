import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BOSS_NAMES } from '../../api/endpoints/parks/raid';
import { BOSS_ART_SCALE, BOSS_ART } from '../../games/boss/BossBrawl';
import type { BossAttackSnapshot } from '../../services/boss/attackRecovery';

/** One compact receipt replaces the fight button until the original round is resolved. */
export default function BossAttackStatus({ snapshot, onRetry }: {
  readonly snapshot: BossAttackSnapshot;
  readonly onRetry: () => void;
}) {
  const busy = ['loading', 'saving', 'sending'].includes(snapshot.phase);
  const confirmed = !!snapshot.receipt && (snapshot.receipt.result.ok || snapshot.receipt.result.error !== 'network');
  const title = snapshot.phase === 'loading' ? 'Checking your last round'
    : snapshot.phase === 'saving' ? 'Saving your brawl'
      : snapshot.phase === 'sending' ? 'Confirming your hit'
        : confirmed ? snapshot.receipt?.result.ok ? 'Your round is confirmed' : 'Your round is checked'
          : snapshot.phase === 'storage_error' ? 'Keep this round safe'
            : 'Your brawl is waiting';
  const detail = snapshot.phase === 'loading' ? 'A quick check before your next fight.'
    : snapshot.phase === 'saving' ? 'Keeping your finished round ready to reconnect.'
      : snapshot.phase === 'sending' ? 'The park is checking this exact round.'
        : confirmed ? 'Finish saving its receipt before another attack.'
          : snapshot.phase === 'storage_error' ? 'We couldn’t read or save the receipt. Retry before another fight.'
            : 'The reply didn’t arrive. Confirm this round before spending more Energy.';
  return <View style={styles.card} accessibilityLiveRegion="polite">
    <View style={styles.head}>
      {snapshot.pending && <Image source={BOSS_ART[snapshot.pending.boss]} contentFit="contain" style={[styles.art, { transform: [{ scale: BOSS_ART_SCALE?.[snapshot.pending.boss] ?? 1 }] }]} />}
      <View style={styles.copy}>
        <Text style={styles.kicker}>BRAWL RECEIPT</Text>
        <Text style={styles.title}>{title}</Text>
        {snapshot.pending && <Text style={styles.where} numberOfLines={2}>
          {BOSS_NAMES[snapshot.pending.boss]}{snapshot.pending.rideName ? ` · ${snapshot.pending.rideName}` : ''}
        </Text>}
      </View>
    </View>
    <Text style={styles.detail}>{detail}</Text>
    {!busy && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
      <Text style={styles.buttonText}>{confirmed ? 'Finish saving receipt' : snapshot.pending ? 'Confirm saved round' : 'Retry receipt check'}</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 14, backgroundColor: '#153861', borderWidth: 2, borderColor: '#A9E4F4', borderRadius: 19, padding: 13 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  art: { width: 58, height: 58 },
  copy: { flex: 1 },
  kicker: { color: '#8EDCEB', fontFamily: 'Knockout', fontSize: 11, letterSpacing: 1.4 },
  title: { color: '#FFF0B4', fontFamily: 'Shark', fontSize: 20, marginTop: 3 },
  where: { color: '#D9EFFF', fontFamily: 'Knockout', fontSize: 13, marginTop: 3 },
  detail: { color: '#E3F3FF', fontFamily: 'Knockout', fontSize: 14, lineHeight: 19, marginTop: 10 },
  button: { backgroundColor: '#FFE079', borderBottomWidth: 3, borderBottomColor: '#BB843A', borderRadius: 12, paddingVertical: 12,
    alignItems: 'center', marginTop: 11, paddingHorizontal: 12 },
  buttonText: { fontFamily: 'Shark', color: '#153861', fontSize: 17, textAlign: 'center' },
});
