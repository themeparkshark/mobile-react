import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BOSS_NAMES } from '../../api/endpoints/parks/raid';
import { BOSS_ART } from './bossArt';
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
      : snapshot.phase === 'sending' ? 'Checking your hit'
        : confirmed ? snapshot.receipt?.result.ok ? 'Your round counted!' : 'Your round is checked'
          : snapshot.phase === 'storage_error' ? 'Keep this round safe'
            : 'Your brawl is waiting';
  const detail = snapshot.phase === 'loading' ? 'A quick check before your next fight.'
    : snapshot.phase === 'saving' ? 'Saving your round so it is not lost.'
      : snapshot.phase === 'sending' ? 'We are checking this round now.'
        : confirmed ? 'Tap below to finish saving it before you attack again.'
          : snapshot.phase === 'storage_error' ? 'We couldn’t save this round. Tap Try again before you fight again.'
            : 'We didn’t hear back. Check this round before you spend more energy.';
  return <View style={styles.card} accessibilityLiveRegion="polite">
    <View style={styles.head}>
      {snapshot.pending && <Image source={BOSS_ART[snapshot.pending.boss]} contentFit="contain" style={styles.art} />}
      <View style={styles.copy}>
        <Text style={styles.kicker}>YOUR LAST BRAWL</Text>
        <Text style={styles.title}>{title}</Text>
        {snapshot.pending && <Text style={styles.where} numberOfLines={2}>
          {BOSS_NAMES[snapshot.pending.boss]}{snapshot.pending.rideName ? `  ·  ${snapshot.pending.rideName}` : ''}
        </Text>}
      </View>
    </View>
    <Text style={styles.detail}>{detail}</Text>
    {!busy && <Pressable accessibilityRole="button" onPress={onRetry} style={styles.button}>
      <Text style={styles.buttonText}>{confirmed ? 'Finish saving' : snapshot.pending ? 'Check this round' : 'Try again'}</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  card: { marginTop: 14, backgroundColor: '#fff8e4', borderWidth: 3, borderColor: '#ffffff', borderRadius: 19, padding: 13,
    shadowColor: '#05346e', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 } },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  art: { width: 58, height: 58 },
  copy: { flex: 1 },
  kicker: { color: '#3d5f8c', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 1.4 },
  title: { color: '#05346e', fontFamily: 'Shark', fontSize: 20, marginTop: 3 },
  where: { color: '#3d5f8c', fontFamily: 'Knockout', fontSize: 14, marginTop: 3 },
  detail: { color: '#05346e', fontFamily: 'Knockout', fontSize: 15, lineHeight: 20, marginTop: 10 },
  button: { backgroundColor: '#ffcf3b', borderWidth: 2, borderColor: '#ffffff', borderBottomWidth: 4, borderBottomColor: '#d99a00',
    borderRadius: 14, paddingVertical: 12, alignItems: 'center', marginTop: 11, paddingHorizontal: 12, minHeight: 48 },
  buttonText: { fontFamily: 'Shark', color: '#05346e', fontSize: 17, textAlign: 'center' },
});
