/**
 * "Line snack": after a wait is over (never while the line is moving), one
 * optional rewarded ad for a little Energy. VIP players claim it with no ad.
 * The server checks the line session really ended and caps it per day.
 */
import * as Haptics from 'expo-haptics';
import { useContext, useState } from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { AuthContext } from '../../../context/AuthProvider';
import { adsAvailable, rewardText, watchForReward } from '../../../services/ads';
import { GameIcon } from '../../../ui';

export default function LineSnackOffer({ sessionId }: { sessionId: string }) {
  const { player, refreshPlayer } = useContext(AuthContext);
  const vip = !!player?.is_subscribed;
  const [state, setState] = useState<'offer' | 'busy' | 'done' | 'gone'>('offer');
  const [note, setNote] = useState<string | null>(null);
  if (state === 'gone' || (!vip && !adsAvailable())) return null;

  const press = async () => {
    if (state !== 'offer') return;
    setState('busy');
    const outcome = await watchForReward('line_energy', sessionId, vip);
    if (outcome.status === 'granted') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setNote(`${rewardText(outcome.reward.reward)} added`);
      setState('done');
      void refreshPlayer?.();
    } else if (outcome.status === 'checking') {
      setNote('Thanks for watching. Your Energy lands in a moment.');
      setState('done');
    } else if (outcome.status === 'skipped') {
      setState('offer');
    } else {
      setState('gone');
    }
  };

  return (
    <Pressable style={styles.chip} onPress={() => void press()} disabled={state !== 'offer'} accessibilityRole="button"
      accessibilityLabel={note ?? (vip ? 'Line snack: tap for free bonus energy. A VIP member extra.' : 'Line snack: watch an ad for bonus Energy')}>
      <GameIcon name={state === 'done' ? 'check' : 'energy'} size={26} />
      <Text style={styles.text} numberOfLines={2}>
        {note ?? (state === 'busy' ? 'One moment...' : vip ? 'Line snack: tap for free bonus energy (VIP)' : 'Line snack: watch an ad for bonus Energy')}
      </Text>
      {state === 'offer' && <GameIcon name={vip ? 'member' : 'play'} size={20} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch', marginTop: 12,
    backgroundColor: '#e4f7ff', borderRadius: 14, borderWidth: 2, borderColor: '#4cdcff', paddingVertical: 8, paddingHorizontal: 12 },
  text: { flex: 1, fontFamily: 'Knockout', fontSize: 15, color: '#05346e' },
});
