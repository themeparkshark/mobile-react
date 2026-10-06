import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BRAND, GameIcon } from '../ui';

const DAY = 24 * 60 * 60_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * When the classic Shark Shop gets new gear, said calmly (clarity pass): the day,
 * never a ticking dd:hh:mm:ss countdown on a shop you buy from. Pure, for tests.
 */
export function restockLine(nextRotationAt: string | null | undefined, now = Date.now()): string | null {
  const target = nextRotationAt ? new Date(nextRotationAt).getTime() : NaN;
  if (!Number.isFinite(target)) return null;
  const left = target - now;
  if (left <= 0) return 'New gear is coming. Check back soon.';
  if (left < DAY && new Date(target).getDate() === new Date(now).getDate()) return 'New gear tonight';
  if (left < 2 * DAY) return 'New gear tomorrow';
  return `New gear on ${WEEKDAYS[new Date(target).getDay()]}`;
}

/** One quiet line. It re-checks once, at the restock, not every second. */
export default function StoreRestockNote({ nextRotationAt, onElapsed }: {
  readonly nextRotationAt: string | null | undefined;
  readonly onElapsed?: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const target = nextRotationAt ? new Date(nextRotationAt).getTime() : NaN;
    if (!Number.isFinite(target)) return undefined;
    const wait = target - Date.now();
    if (wait <= 0) { onElapsed?.(); return undefined; }
    // setTimeout caps near 24.8 days; a shop restock is always sooner.
    const timer = setTimeout(() => { setNow(Date.now()); onElapsed?.(); }, Math.min(wait, 2_000_000_000));
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextRotationAt]);
  const line = restockLine(nextRotationAt, now);
  if (!line) return null;
  return (
    <View style={styles.container} accessible accessibilityLabel={line}>
      <GameIcon name="new" size={22} />
      <Text style={styles.text}>{line}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: BRAND.blue, borderRadius: 14, borderWidth: 3, borderColor: BRAND.navy,
    paddingVertical: 10, paddingHorizontal: 12, marginHorizontal: 16, marginVertical: 8,
  },
  text: { fontFamily: 'Shark', fontSize: 17, color: BRAND.white, flexShrink: 1, textAlign: 'center' },
});
