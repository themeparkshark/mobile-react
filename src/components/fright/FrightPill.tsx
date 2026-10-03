/**
 * The Fin-ister pill on the map (R6 mode ON, R7, F5): mode name, "4 of 10
 * haunts", the pace line, or "Gates open 6:30 PM" in early. Phones-down shows
 * "In line: {haunt} · {mm} min" while in a queue. A small "?" replays the tutorial.
 */
import { useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { GameIcon } from '../../ui';
import { parkTimeLabel } from '../../services/fright/dates';
import { hauntCountText, pillSubLine, shortestLineText } from '../../services/fright/pace';
import { minutesInLine } from '../../services/fright/run';
import { countdownTarget } from '../../services/fright/phase';
import { NIGHT } from '../../services/fright/theme';
import type { FrightNight } from '../../hooks/useFrightNight';
import ArtImage from './ArtImage';
import type { FrightEngine } from './useFrightEngine';

/** The real Deep Lantern art, bundled, so every player sees it (server art only overrides). */
const LANTERN = require('./art/lantern.webp');

export default function FrightPill({ night, engine, onHelp }: {
  readonly night: FrightNight;
  readonly engine: FrightEngine;
  /** Replay the tutorial ("?"). */
  readonly onHelp: () => void;
}) {
  const [, setTick] = useState(0);
  const rowRef = useRef<View>(null);
  const { setPillBottom } = engine;
  useEffect(() => () => setPillBottom(null), [setPillBottom]);
  useEffect(() => {
    const timer = setInterval(() => setTick(value => value + 1), 30_000);
    return () => clearInterval(timer);
  }, []);
  const { tonight, phase, title } = night;
  if (!tonight?.night || !night.modeOn) return null;
  const now = night.now();
  const haunts = tonight.spots.filter(spot => spot.kind === 'haunt');
  const done = tonight.me?.haunts_tonight ?? 0;
  const early = phase === 'early' || countdownTarget(tonight.night, now) != null;
  const sub = pillSubLine({
    inLine: engine.openRun && engine.openSpot ? { name: engine.openSpot.name, minutes: minutesInLine(engine.openRun, now) } : null,
    gatesOpen: early ? parkTimeLabel(tonight.night.opens_at, tonight.event?.timezone) : null,
    done, total: haunts.length, shortest: shortestLineText(tonight.spots, engine.doneKeys),
  });
  const label = `${title}. ${hauntCountText(done, haunts.length)}. ${sub}. Open the haunt list.`;
  return (
    <View ref={rowRef} style={styles.row} onLayout={() => {
      // Coach marks and toasts sit just under the pill, never on top of it.
      rowRef.current?.measureInWindow((_x, y, _w, h) => { if (Number.isFinite(y) && h > 0) setPillBottom(y + h); });
    }}>
      <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={() => engine.setSheetOpen(true)}
        style={({ pressed }) => [styles.pill, pressed && { opacity: 0.9 }]}>
        <View style={styles.lantern}>
          <ArtImage uri={engine.art.chip} style={{ width: 34, height: 34 }}
            fallback={<Image source={LANTERN} style={{ width: 34, height: 34 }} contentFit="contain" />} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} numberOfLines={1}>{title}  <Text style={styles.count}>{hauntCountText(done, haunts.length)}</Text></Text>
          <Text style={styles.sub} numberOfLines={1}>{sub}</Text>
        </View>
        {engine.pendingSync > 0 && <GameIcon name="retry" size={14} />}
        <GameIcon name="arrow" size={16} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`How ${title} works`} onPress={onHelp} hitSlop={8}
        style={styles.help}>
        <Text style={styles.helpText}>?</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 12, marginTop: 8, gap: 6 },
  pill: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 3, borderColor: NIGHT.fog,
    backgroundColor: NIGHT.haunt, paddingVertical: 5, paddingLeft: 6, paddingRight: 10, minHeight: 48,
    shadowColor: NIGHT.ink, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  lantern: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,179,71,0.3)', alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: 'Shark', fontSize: 14, color: NIGHT.candy },
  count: { fontFamily: 'Knockout', fontSize: 13, color: NIGHT.fogLight },
  sub: { fontFamily: 'Knockout', fontSize: 13, color: NIGHT.fogLight },
  help: { width: 44, height: 44, borderRadius: 22, backgroundColor: NIGHT.midnight, borderWidth: 3, borderColor: NIGHT.fog,
    alignItems: 'center', justifyContent: 'center' },
  helpText: { fontFamily: 'Shark', fontSize: 20, color: NIGHT.candy },
});
