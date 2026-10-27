import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BRAND, FONT, GameIcon, OUTLINE, RADIUS, SHADOW } from '../../ui';

/** Calm retries while the park map data will not load: 5 s, 10 s, 20 s, then every 30 s. */
export function mapRetryDelay(attempt: number): number {
  return Math.min(30_000, 5_000 * 2 ** Math.max(0, attempt));
}

/**
 * Keeps trying the park map data after a failed load, and lets the player try
 * right away. Runs only while the load has failed and the map is on screen.
 */
export function useParkMapRetry(failed: boolean, active: boolean, retry: () => Promise<unknown>) {
  const [retrying, setRetrying] = useState(false);
  const attempt = useRef(0);
  const latest = useRef(retry); latest.current = retry;
  const run = useCallback(() => {
    setRetrying(true);
    void latest.current().catch(() => undefined).finally(() => setRetrying(false));
  }, []);
  useEffect(() => { if (!failed) attempt.current = 0; }, [failed]);
  useEffect(() => {
    if (!failed || !active || retrying) return;
    const timer = setTimeout(() => { attempt.current += 1; run(); }, mapRetryDelay(attempt.current));
    return () => clearTimeout(timer);
  }, [failed, active, retrying, run]);
  // The first miss (often a slow launch) reads as "looking" while the first quiet retry runs;
  // "can't see the rides" waits until a retry has failed too.
  return { retrying, retryNow: run, calm: failed && attempt.current === 0 };
}

/** The one quiet note over the park map when rides could not load. The park buttons stay put. */
function ParkMapRetryCard({ retrying, onRetry }: { readonly retrying: boolean; readonly onRetry: () => void }) {
  return <Pressable accessibilityRole="button" disabled={retrying} onPress={onRetry} hitSlop={6}
    accessibilityLabel={retrying ? 'Looking for the rides' : 'The rides did not load. Tap to try again'}
    style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.97 }] }]}>
    <GameIcon name="ride" size={30} />
    <View style={styles.copy}>
      <Text style={styles.title} numberOfLines={1}>{retrying ? 'LOOKING FOR RIDES' : "CAN'T SEE THE RIDES"}</Text>
      <Text style={styles.detail} numberOfLines={1}>{retrying ? 'One moment...' : 'Weak signal. Tap to try again.'}</Text>
    </View>
    {!retrying && <View style={styles.retry}><GameIcon name="retry" size={20} /></View>}
  </Pressable>;
}

export default memo(ParkMapRetryCard);

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'center',
    backgroundColor: BRAND.white, borderColor: BRAND.navy, borderWidth: OUTLINE.thick, borderRadius: RADIUS.lg,
    paddingVertical: 8, paddingLeft: 10, paddingRight: 10, maxWidth: 300, ...SHADOW.card,
  },
  copy: { flexShrink: 1 },
  title: { fontFamily: FONT.display, fontSize: 15, color: BRAND.navy },
  detail: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft },
  retry: {
    width: 32, height: 32, borderRadius: RADIUS.pill, backgroundColor: BRAND.gold,
    borderColor: BRAND.navy, borderWidth: OUTLINE.thin, alignItems: 'center', justifyContent: 'center',
  },
});
