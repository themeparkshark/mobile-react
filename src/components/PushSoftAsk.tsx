import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { enablePush, pushState, type PushState } from '../services/push';
import { GameIcon } from '../ui';

/** "Never miss a boss": shown only while notifications are undecided. */
export default function PushSoftAsk({ dark = false }: { readonly dark?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  const [hidden, setHidden] = useState(false);
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  if (state !== 'undetermined' || hidden) return null;
  return (
    <View style={[styles.card, dark && styles.cardDark]}>
      <GameIcon name="bell" size={30} />
      <Text style={styles.text} numberOfLines={2}>Want an alert when a boss shows up or a ride has a Rush bonus?</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Turn on alerts" style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={() => { enablePush().then(setState).catch(() => undefined); }}>
        <Text style={styles.btnText}>TURN ON</Text>
      </Pressable>
      {/* A clear way out: hides the ask for now; nothing changes on the phone. */}
      <Pressable accessibilityRole="button" accessibilityLabel="Not now" hitSlop={8} onPress={() => setHidden(true)}>
        <GameIcon name="close" size={20} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 14, padding: 8, marginBottom: 8, borderWidth: 2, borderColor: 'rgba(255,255,255,0.35)' },
  cardDark: { backgroundColor: 'rgba(255,255,255,0.12)' },
  text: { flex: 1, fontFamily: 'Knockout', fontSize: 14, color: '#fff' },
  btn: { backgroundColor: '#ffcf3b', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6,
    borderBottomWidth: 3, borderBottomColor: '#d99a00' },
  btnPressed: { transform: [{ translateY: 2 }], borderBottomWidth: 1 },
  btnText: { fontFamily: 'Shark', fontSize: 13, color: '#05346e' },
});
