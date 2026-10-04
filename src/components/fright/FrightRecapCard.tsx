/**
 * The Marquee card: a marquee-bulb sign for one night. Date written out,
 * haunts survived, your top haunt, time in line, Case Files, the encounter and
 * a Ten-in-One stamp. Pure display of FrightRecap (CONTRACT 3), exported for
 * other consumers.
 */
import { forwardRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { FrightRecap } from '../../api/endpoints/fright';
import { marqueeModel } from '../../services/fright/marquee';
import { NIGHT } from '../../services/fright/theme';
import { GameIcon } from '../../ui';
import ArtImage from './ArtImage';

const BULBS = 11;

function BulbRow() {
  return (
    <View style={styles.bulbs}>
      {Array.from({ length: BULBS }, (_, i) => <View key={i} style={[styles.bulb, i % 2 ? styles.bulbDim : null]} />)}
    </View>
  );
}

const FrightRecapCard = forwardRef<View, {
  readonly recap: FrightRecap;
  /** Server marquee background (art.recap_bg); null keeps the drawn card. */
  readonly background?: string | null;
}>(function FrightRecapCard({ recap, background = null }, ref) {
  const m = marqueeModel(recap);
  const stats = [
    m.topHaunt ? `Your #1 tonight: ${m.topHaunt}` : null,
    m.timeInLine,
    m.caseFiles ? `${m.caseFiles} Case File${m.caseFiles === 1 ? '' : 's'}` : null,
    // One name per critter: "Caught Ringmaster Riptide", or neutral when the recap has no critter name.
    m.caught,
  ].filter((line): line is string => !!line);
  return (
    <View ref={ref} collapsable={false} style={styles.card} accessible
      accessibilityLabel={`${recap.card_title}. ${m.date}. ${m.headline} ${stats.join('. ')}`}>
      <ArtImage uri={background} fit="cover" style={StyleSheet.absoluteFill} />
      <BulbRow />
      <View style={styles.body}>
        <Text style={styles.kicker}>{recap.card_title.toUpperCase()}</Text>
        <Text style={styles.date}>{m.date}</Text>
        <Text style={styles.big}>{m.hauntsSurvived}</Text>
        <Text style={styles.headline}>{m.headline}</Text>
        {stats.map(line => <Text key={line} style={styles.stat} numberOfLines={2}>{line}</Text>)}
        {m.tenInOne && (
          <View style={styles.stamp}><GameIcon name="trophy" size={22} /><Text style={styles.stampText}>TEN-IN-ONE</Text></View>
        )}
        {/* On its own scrim so it never sits on the house and tree silhouettes of the background art. */}
        <View style={styles.footPlate}><Text style={styles.foot}>{`${recap.park_name} · Night ${m.nightNumber} · Theme Park Shark`}</Text></View>
      </View>
      <BulbRow />
    </View>
  );
});

export default FrightRecapCard;

const styles = StyleSheet.create({
  card: { backgroundColor: NIGHT.haunt, borderRadius: 24, borderWidth: 4, borderColor: NIGHT.candy, overflow: 'hidden' },
  bulbs: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 8, backgroundColor: NIGHT.midnight },
  bulb: { width: 12, height: 12, borderRadius: 6, backgroundColor: NIGHT.moon, shadowColor: NIGHT.lantern, shadowOpacity: 0.9, shadowRadius: 6 },
  bulbDim: { backgroundColor: NIGHT.lantern },
  body: { alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14 },
  kicker: { fontFamily: 'Knockout', fontSize: 13, letterSpacing: 1.5, color: NIGHT.fog },
  date: { fontFamily: 'Shark', fontSize: 22, color: NIGHT.moon, marginTop: 4, textAlign: 'center' },
  big: { fontFamily: 'Shark', fontSize: 64, color: NIGHT.candy, marginTop: 4,
    textShadowColor: NIGHT.ink, textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 0 },
  headline: { fontFamily: 'Shark', fontSize: 20, color: NIGHT.white, textAlign: 'center' },
  stat: { fontFamily: 'Knockout', fontSize: 16, color: NIGHT.fogLight, marginTop: 6, textAlign: 'center' },
  stamp: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, borderWidth: 3, borderColor: NIGHT.candy,
    borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, transform: [{ rotate: '-4deg' }] },
  stampText: { fontFamily: 'Shark', fontSize: 16, color: NIGHT.candy },
  footPlate: { marginTop: 12, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: 'rgba(30,24,56,0.78)' },
  foot: { fontFamily: 'Knockout', fontSize: 13, color: NIGHT.fogLight },
});
