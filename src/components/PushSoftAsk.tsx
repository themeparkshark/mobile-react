import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { enablePush, pushState, type PushState } from '../services/push';

/** "Never miss a boss": shown only while notifications are undecided. */
export default function PushSoftAsk({ dark = false }: { readonly dark?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  if (state !== 'undetermined') return null;
  return (
    <View style={[styles.card, dark && styles.cardDark]}>
      <Text style={styles.bell}>🔔</Text>
      <Text style={styles.text} numberOfLines={2}>Get a heads-up when a boss surfaces or a ride goes on Rush.</Text>
      <Pressable accessibilityRole="button" style={styles.btn} onPress={() => { enablePush().then(setState).catch(() => undefined); }}>
        <Text style={styles.btnText}>TURN ON</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14, padding: 8, marginBottom: 8 },
  cardDark: { backgroundColor: 'rgba(255,255,255,0.08)' },
  bell: { fontSize: 20 },
  text: { flex: 1, fontFamily: 'Knockout', fontSize: 13, color: '#fff' },
  btn: { backgroundColor: '#ffcf3b', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  btnText: { fontFamily: 'Shark', fontSize: 13, color: '#075083' },
});
