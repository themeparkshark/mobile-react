/**
 * An odometer for the HUD counters (Brawl Stars and Clash Royale currency chips): each changed digit
 * rolls from its old value to its new one, the ones first and each column to the left 30 ms later,
 * with a small overshoot on the way in. A spend rolls down quietly. Every frame runs on the UI thread
 * (one shared value per column), and React only re-renders when the target number changes.
 * Reduce Motion: the number simply changes.
 */
import { memo, useEffect } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { EASE } from '../../ui/motionEasing';
import { digitColumns } from '../map/alive/mapWow';

const STRIP = Array.from({ length: 20 }, (_, i) => String(i % 10));

function Column({ ch, delay, rolls, up, ms, lineHeight, width, textStyle, reduced }: {
  readonly ch: string; readonly delay: number; readonly rolls: boolean; readonly up: boolean; readonly ms: number;
  readonly lineHeight: number; readonly width: number; readonly textStyle: StyleProp<TextStyle>; readonly reduced: boolean;
}) {
  const to = Number(ch);
  const pos = useSharedValue(to);
  useEffect(() => {
    cancelAnimation(pos);
    const from = ((pos.value % 10) + 10) % 10;
    if (reduced || !rolls || Math.abs(from - to) < 0.01) { pos.value = to; return; }
    // Gains roll forward through 9 to 0; spends roll back. Start from wherever the column is now,
    // so a second gain landing mid-roll just carries on (one roll, never a stutter).
    const start = up ? from : (to > from ? from + 10 : from);
    const end = up ? (to < from ? to + 10 : to) : to;
    pos.value = start;
    const over = up ? 0.09 : 0;
    pos.value = withDelay(delay, withSequence(
      withTiming(end + over, { duration: Math.round(ms * 0.82), easing: EASE.out }),
      withTiming(end, { duration: Math.round(ms * 0.18), easing: EASE.inOut }, done => { if (done) pos.value = to; }),
    ));
  }, [ch, rolls, up, delay, ms, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const strip = useAnimatedStyle(() => ({ transform: [{ translateY: -pos.value * lineHeight }] }));
  return (
    <View style={{ width, height: lineHeight, overflow: 'hidden' }}>
      <Animated.View style={strip}>
        {STRIP.map((d, i) => <Text key={i} allowFontScaling={false} style={[textStyle, styles.cell, { lineHeight, height: lineHeight, width }]}>{d}</Text>)}
      </Animated.View>
    </View>
  );
}

function RollingDigits({ text, previous, up, ms, fontSize, textStyle, reduced }: {
  /** What to show at rest ("1,374", "12.4K"). */
  readonly text: string;
  /** What was shown before (for which columns roll). */
  readonly previous: string;
  /** A gain (rolls up) or a spend (rolls down). */
  readonly up: boolean;
  readonly ms: number;
  readonly fontSize: number;
  readonly textStyle: StyleProp<TextStyle>;
  readonly reduced: boolean;
}) {
  const cols = digitColumns(previous, text);
  const lineHeight = Math.round(fontSize * 1.28);
  const digitW = Math.round(fontSize * 0.64);
  return (
    <View style={styles.row} accessible={false}>
      {cols.map((c, i) => {
        // Keyed from the right, so the ones column stays the same view when the number grows a digit.
        const key = `c${cols.length - 1 - i}`;
        if (c.to >= '0' && c.to <= '9') {
          return <Column key={key} ch={c.to} delay={c.delay} rolls={c.rolls} up={up} ms={ms} lineHeight={lineHeight}
            width={digitW} textStyle={textStyle} reduced={reduced} />;
        }
        const narrow = c.to === ',' || c.to === '.';
        return <Text key={key} allowFontScaling={false}
          style={[textStyle, styles.cell, { lineHeight, height: lineHeight, width: Math.round(fontSize * (narrow ? 0.3 : 0.62)) }]}>{c.to}</Text>;
      })}
    </View>
  );
}

export default memo(RollingDigits);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  cell: { textAlign: 'center', includeFontPadding: false },
});
