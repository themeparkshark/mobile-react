import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as Linking from 'expo-linking';
import { useContext, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import client from '../api/client';
import { AuthContext } from '../context/AuthProvider';
import { playSfx } from '../gamekit/SFX';
import Ribbon from './Ribbon';

const PENDING_KEY = 'tps.pendingSharkDrop';

/** themeparkshark://drop/CHURRO, .../drop?code=CHURRO, or any link with ?drop=CHURRO. */
export function parseDropCode(url: string | null): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const path = `${parsed.hostname ?? ''}/${parsed.path ?? ''}`.replace(/^\/+|\/+$/g, '');
    const fromPath = path.match(/(?:^|\/)drop\/([A-Za-z0-9]{4,20})$/)?.[1];
    const fromQuery = (parsed.queryParams?.drop ?? parsed.queryParams?.code) as string | undefined;
    const code = fromPath ?? (fromQuery && /^[A-Za-z0-9]{4,20}$/.test(fromQuery) ? fromQuery : null);
    return code ? code.toUpperCase() : null;
  } catch {
    return null;
  }
}

interface DropResult {
  readonly coins?: number | null;
  readonly tickets?: number;
  readonly energy?: number;
  readonly item?: { readonly name: string; readonly icon_url?: string } | null;
}

/**
 * Instagram "Shark Drops": a post links to themeparkshark://drop/CODE. The code
 * is redeemed once the player has a shark (it waits through sign-up), then a
 * chest bursts open with the reward. Errors (ended, used, wrong) show inline.
 */
export default function SharkDropHandler() {
  const { player, refreshPlayer } = useContext(AuthContext);
  const [pending, setPending] = useState<string | null>(null);
  const [state, setState] = useState<{ code: string; result?: DropResult; error?: string } | null>(null);
  const busy = useRef(false);
  const lid = useSharedValue(0);
  const prize = useSharedValue(0);

  const queue = async (url: string | null) => {
    const code = parseDropCode(url);
    if (!code) return;
    await AsyncStorage.setItem(PENDING_KEY, code).catch(() => undefined);
    setPending(code);
  };

  useEffect(() => {
    void Linking.getInitialURL().then(queue);
    void AsyncStorage.getItem(PENDING_KEY).then(code => { if (code) setPending(code); }).catch(() => undefined);
    const sub = Linking.addEventListener('url', ({ url }) => void queue(url));
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (!pending || !player?.username || busy.current) return;
    busy.current = true;
    const code = pending;
    setState({ code });
    lid.value = 0;
    prize.value = 0;
    void client.post<{ data: DropResult }>('/coin-codes/redeem', { code })
      .then(({ data }) => {
        setState({ code, result: data.data });
        lid.value = withSequence(withTiming(1, { duration: 120 }), withSpring(1));
        prize.value = withDelay(250, withSpring(1, { damping: 9, stiffness: 150 }));
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        playSfx('win');
        void refreshPlayer?.();
      })
      .catch((error) => {
        const message = error?.response?.data?.message ?? 'We couldn’t open this drop. Check your connection and tap the link again.';
        setState({ code, error: message });
      })
      .finally(() => {
        void AsyncStorage.removeItem(PENDING_KEY).catch(() => undefined);
        setPending(null);
        busy.current = false;
      });
  }, [pending, player?.username]);

  const prizeStyle = useAnimatedStyle(() => ({
    opacity: prize.value, transform: [{ translateY: (1 - prize.value) * 30 }, { scale: 0.6 + prize.value * 0.4 }],
  }));

  const r = state?.result;
  const lines = r ? [
    r.item ? `${r.item.name} unlocked!` : null,
    r.tickets ? `+${r.tickets} ticket${r.tickets === 1 ? '' : 's'}` : null,
    r.coins ? `+${r.coins} coins` : null,
    r.energy ? `+${r.energy} energy` : null,
  ].filter(Boolean) as string[] : [];

  return (
    <Modal isVisible={!!state} backdropOpacity={0.75} animationIn="zoomIn" animationOut="zoomOut"
      onBackdropPress={state?.result || state?.error ? () => setState(null) : undefined}>
      <View style={styles.wrap}>
        <Ribbon text="Shark Drop!" />
        <View style={styles.card}>
          <Text style={styles.code}>{state?.code}</Text>
          <Image source={r ? require('../../assets/images/daily/chest-open.png') : require('../../assets/images/daily/chest-closed.png')}
            style={styles.chest} contentFit="contain" />
          {!r && !state?.error && <Text style={styles.hint}>Opening your drop…</Text>}
          {state?.error && <Text style={styles.error}>{state.error}</Text>}
          {r && <Animated.View style={[styles.prizes, prizeStyle]}>
            {r.item?.icon_url && <Image source={{ uri: r.item.icon_url }} style={styles.itemIcon} contentFit="contain" />}
            {lines.map(line => <Text key={line} style={styles.prizeText}>{line}</Text>)}
          </Animated.View>}
          {(r || state?.error) && <Pressable style={styles.button} accessibilityRole="button" onPress={() => setState(null)}>
            <Text style={styles.buttonText}>{r ? 'LET’S GO!' : 'OK'}</Text>
          </Pressable>}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  card: { width: '92%', marginTop: -14, backgroundColor: '#0768b9', borderRadius: 24, borderWidth: 4, borderColor: '#fff',
    paddingTop: 22, paddingBottom: 18, paddingHorizontal: 16, alignItems: 'center' },
  code: { fontFamily: 'Knockout', fontSize: 16, letterSpacing: 3, color: '#cdeaff' },
  chest: { width: 200, height: 200 },
  hint: { fontFamily: 'Shark', fontSize: 20, color: '#ffcf3b' },
  error: { fontFamily: 'Knockout', fontSize: 17, color: '#fff', textAlign: 'center' },
  prizes: { alignItems: 'center', gap: 2 },
  itemIcon: { width: 80, height: 80 },
  prizeText: { fontFamily: 'Shark', fontSize: 24, color: '#ffcf3b',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  button: { marginTop: 14, alignSelf: 'stretch', backgroundColor: '#ffcf3b', borderRadius: 16, paddingVertical: 12,
    alignItems: 'center', borderBottomWidth: 4, borderBottomColor: '#d99a00' },
  buttonText: { fontFamily: 'Shark', fontSize: 20, color: '#075083' },
});
