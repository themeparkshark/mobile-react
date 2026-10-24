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
import { digitColumns, rollPos } from '../map/alive/mapWow';
import { hudClock, hudStreamId } from './hudPulse';

const STRIP = Array.from({ length: 20 }, (_, i) => String(i % 10));

/** A roll on the catch's shared clock (hudPulse): starts when the first coin lands, never on a JS timer. */
export interface DigitStream {
  readonly id: number;
  /** hudClock time of the first landing. */
  readonly startAt: number;
}

function Column({ ch, from, delay, rolls, up, ms, lineHeight, width, textStyle, reduced, stream }: {
  readonly ch: string; readonly from: number | null; readonly delay: number; readonly rolls: boolean; readonly up: boolean; readonly ms: number;
  readonly lineHeight: number; readonly width: number; readonly textStyle: StyleProp<TextStyle>; readonly reduced: boolean;
  readonly stream: DigitStream | null;
}) {
  const to = Number(ch);
  const pos = useSharedValue(from ?? to);
  // The roll's span, from the props alone (round 2 read the column's live value and could show the new
  // number for a frame, then the old one, then roll: 370, 360, 370).
  const start = from == null || !rolls ? to : up ? from : (to > from ? from + 10 : from);
  const end = from == null || !rolls ? to : up ? (to < from ? to + 10 : to) : to;
  const sid = stream && rolls && !reduced ? stream.id : 0;
  const sAt = stream ? stream.startAt + delay : 0;
  useEffect(() => {
    cancelAnimation(pos);
    // A stream column rolls on the shared clock; its resting digit waits underneath for when the stream ends.
    if (sid > 0 || reduced || start === end) { pos.value = to; return; }
    pos.value = start;
    const over = up ? 0.09 : 0;
    pos.value = withDelay(delay, withSequence(
      withTiming(end + over, { duration: Math.round(ms * 0.82), easing: EASE.out }),
      withTiming(end, { duration: Math.round(ms * 0.18), easing: EASE.inOut }, done => { if (done) pos.value = to; }),
    ));
  }, [ch, start, end, up, delay, ms, reduced, sid]); // eslint-disable-line react-hooks/exhaustive-deps
  const strip = useAnimatedStyle(() => {
    // The first-render style is computed on the JS thread, where the clock's copy can be stale: it always
    // starts from the old digit there (the UI thread takes over on the next frame).
    const onUi = (globalThis as { _WORKLET?: boolean })._WORKLET === true;
    const v = !onUi ? start : sid > 0 && hudStreamId.value === sid ? rollPos(hudClock.value, sAt, start, end, ms) : pos.value;
    return { transform: [{ translateY: -v * lineHeight }] };
  });
  return (
    <View style={{ width, height: lineHeight, overflow: 'hidden' }}>
      <Animated.View style={strip}>
        {STRIP.map((d, i) => <Text key={i} allowFontScaling={false} style={[textStyle, styles.cell, { lineHeight, height: lineHeight, width }]}>{d}</Text>)}
      </Animated.View>
    </View>
  );
}

function RollingDigits({ text, previous, up, ms, fontSize, textStyle, reduced, stream = null, rollKey = 0 }: {
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
  /** Round 3: roll on the catch's clock instead of from this render. */
  readonly stream?: DigitStream | null;
  /**
   * Bumped on every new number: each roll mounts fresh columns. On Fabric with Reanimated 3.16 a re-render
   * pushes a view's first-render style again, so a reused column could flash the digit it was mounted with
   * (round 2's 370, 360, 370).
   */
  readonly rollKey?: number;
}) {
  const cols = digitColumns(previous, text);
  const lineHeight = Math.round(fontSize * 1.28);
  const digitW = Math.round(fontSize * 0.64);
  return (
    <View style={styles.row} accessible={false}>
      {cols.map((c, i) => {
        // Keyed from the right, so the ones column stays the same view when the number grows a digit.
        const key = `c${cols.length - 1 - i}-${rollKey}`;
        if (c.to >= '0' && c.to <= '9') {
          return <Column key={key} ch={c.to} from={c.from} delay={c.delay} rolls={c.rolls} up={up} ms={ms} lineHeight={lineHeight}
            width={digitW} textStyle={textStyle} reduced={reduced} stream={stream} />;
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
