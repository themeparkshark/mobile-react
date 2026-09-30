import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BRAND, GameIcon } from '../ui';

interface Props {
  nextRotationAt: string | null;
  /** Called once when the countdown reaches zero, so the shop can look for the restock. */
  onElapsed?: () => void;
}

type TimeLeft = { days: number; hours: number; minutes: number; seconds: number };

/** Split a remaining duration into whole days, hours, minutes and seconds (null once it has elapsed). */
export function splitTimeLeft(targetMs: number, nowMs: number): TimeLeft | null {
  const diff = targetMs - nowMs;
  if (!Number.isFinite(diff) || diff <= 0) return null;
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
  };
}

/**
 * Shark Shop restock timer on a brand-blue plate. At zero it never sits on
 * 0:00:00:00: it says the restock is on the way and tells the shop to check.
 */
export default function StoreCountdown({ nextRotationAt, onElapsed }: Props) {
  const target = nextRotationAt ? new Date(nextRotationAt).getTime() : NaN;
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(() => splitTimeLeft(target, Date.now()));

  useEffect(() => {
    if (!Number.isFinite(target)) return;
    let fired = false;
    const tick = () => {
      const next = splitTimeLeft(target, Date.now());
      setTimeLeft(next);
      if (!next && !fired) { fired = true; onElapsed?.(); }
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  if (!Number.isFinite(target)) return null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <GameIcon name="timer" size={18} />
        <Text style={styles.headerText}>{timeLeft ? 'NEW ITEMS IN' : 'NEW ITEMS'}</Text>
      </View>
      {timeLeft ? (
        <View style={styles.timerRow}>
          {([
            [String(timeLeft.days), 'DAYS'],
            [String(timeLeft.hours).padStart(2, '0'), 'HRS'],
            [String(timeLeft.minutes).padStart(2, '0'), 'MIN'],
            [String(timeLeft.seconds).padStart(2, '0'), 'SEC'],
          ] as const).map(([value, label], index) => (
            <View key={label} style={styles.timerRow}>
              {index > 0 && <Text style={styles.separator}>:</Text>}
              <View style={styles.timeBlock}>
                <Text style={styles.timeValue}>{value}</Text>
                <Text style={styles.timeLabel}>{label}</Text>
              </View>
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.restock}>Fresh gear is on its way. Check back in a few minutes.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: BRAND.blue,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 16,
    marginVertical: 8,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: BRAND.navy,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 6, gap: 6 },
  headerText: { fontFamily: 'Shark', fontSize: 15, color: '#ffcf3b', letterSpacing: 1 },
  timerRow: { flexDirection: 'row', alignItems: 'center' },
  timeBlock: { alignItems: 'center', minWidth: 45 },
  timeValue: { fontFamily: 'Shark', fontSize: 26, color: BRAND.white },
  timeLabel: { fontFamily: 'Knockout', fontSize: 11, color: BRAND.sky, marginTop: 2 },
  separator: { fontFamily: 'Shark', fontSize: 22, color: BRAND.sky, marginHorizontal: 4, marginBottom: 14 },
  restock: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.white, textAlign: 'center' },
});
