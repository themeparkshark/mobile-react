import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { enablePush, pushState, type PushState } from '../services/push';
import { GameIcon } from '../ui';

/** "Never miss a boss": shown only while notifications are undecided. */
export default function PushSoftAsk({ dark = false }: { readonly dark?: boolean }) {
  const [state, setState] = useState<PushState | null>(null);
  useEffect(() => { pushState().then(setState).catch(() => setState('unsupported')); }, []);
  if (state !== 'undetermined') return null;
  return (
    <View style={[styles.card, dark && styles.cardDark]}>
      <GameIcon name="bell" size={30} />
      <Text style={styles.text} numberOfLines={2}>Get a heads-up when a boss surfaces or a ride goes on Rush.</Text>
      <Pressable accessibilityRole="button" style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
        onPress={() => { enablePush().then(setState).catch(() => undefined); }}>
        <Text style={styles.btnText}>TURN ON</Text>
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
