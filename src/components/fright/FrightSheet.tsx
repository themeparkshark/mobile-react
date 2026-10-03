/**
 * The haunt sheet (DESIGN 5, F5): tonight's haunts sorted by posted wait then
 * walking distance, with codename, posted wait, status, your bead and fan
 * badge; "I'm in line", "Play in line", "I survived it!"; the reefs; and the
 * Spooky effects toggle. Night palette. No free text anywhere.
 */
import { useContext } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { FrightSpot } from '../../api/endpoints/fright';
import { LocationContext } from '../../context/LocationProvider';
import * as RootNavigation from '../../RootNavigation';
import { GameIcon } from '../../ui';
import { COPY } from '../../services/fright/copy';
import { nightDateLabel } from '../../services/fright/dates';
import { fanBadge, hauntCountText, sortHaunts } from '../../services/fright/pace';
import { quietMinutesLeft } from '../../services/fright/run';
import { NIGHT } from '../../services/fright/theme';
import type { FrightNight } from '../../hooks/useFrightNight';
import { frightLinePlayRide } from './frightLinePlay';
import { NightButton } from './ui';
import type { FrightEngine } from './useFrightEngine';

function statusText(spot: FrightSpot): string {
  if (spot.status && spot.status !== 'OPERATING') return 'Closed right now';
  if (!spot.accepting) return 'Not open yet';
  return spot.posted_minutes != null ? `Sign says ${spot.posted_minutes} min` : 'Wait unknown';
}

export default function FrightSheet({ night, engine }: { readonly night: FrightNight; readonly engine: FrightEngine }) {
  const { latestLocationSampleRef } = useContext(LocationContext);
  const { tonight, title } = night;
  if (!tonight?.event) return null;
  const event = tonight.event;
  const me = tonight.me;
  const from = latestLocationSampleRef.current;
  const haunts = sortHaunts(tonight.spots, from);
  const reefs = tonight.spots.filter(spot => spot.kind === 'reef');
  const runs = new Map((me?.runs ?? []).map(run => [run.key, run]));
  const open = engine.openRun;
  const close = () => engine.setSheetOpen(false);
  const date = nightDateLabel(tonight.night?.night_on);

  return (
    <Modal visible={engine.sheetOpen} transparent animationType="slide" onRequestClose={close}>
      <Pressable style={styles.scrim} onPress={close} accessibilityLabel="Close the haunt list" />
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.grab} />
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} accessibilityRole="header">{title}</Text>
            <Text style={styles.sub}>{[date, hauntCountText(me?.haunts_tonight ?? 0, haunts.length)].filter(Boolean).join(' · ')}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} hitSlop={10}><GameIcon name="close" size={30} /></Pressable>
        </View>

        {open && engine.openSpot && (
          <View style={styles.runCard} accessibilityLiveRegion="polite">
            <Text style={styles.runName}>{engine.openSpot.name}</Text>
            {engine.quiet ? (
              <Text style={styles.runLine}>{`${COPY.shusherEnter} (${quietMinutesLeft(open, night.now(), engine.openSpot.walk_minutes)} min)`}</Text>
            ) : (
              <Text style={styles.runLine}>Out of the haunt? Tap below.</Text>
            )}
            <NightButton label={COPY.survived} icon="check" disabled={!engine.canSurvive}
              loading={engine.busyKey === open.key} onPress={() => { void engine.survived(); }}
              accessibilityHint={engine.canSurvive ? undefined : 'Unlocks after the minimum time inside'} style={{ marginTop: 8 }} />
          </View>
        )}

        <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 12 }}>
          {!haunts.length && <Text style={styles.empty}>{COPY.empty}</Text>}
          {haunts.map(spot => {
            const run = runs.get(spot.key);
            const done = !!run?.done_at;
            const check = engine.enterCheck(spot);
            const badge = fanBadge(spot.fan_rank);
            return (
              <View key={spot.key} style={styles.row}>
                <View style={[styles.bead, done && styles.beadLit]}>
                  {done ? <GameIcon name="check" size={16} /> : <Text style={styles.beadText}>{spot.sort}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name} numberOfLines={2}>{spot.name}</Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {[statusText(spot), run?.wait_minutes != null ? `You waited ${run.wait_minutes}` : null, badge].filter(Boolean).join(' · ')}
                  </Text>
                  <View style={styles.actions}>
                    {!open && !done && (
                      <NightButton label={COPY.inLine} icon="queue" disabled={!check.ok} loading={engine.busyKey === spot.key}
                        onPress={() => { void engine.enter(spot); }}
                        accessibilityHint={check.ok ? 'Starts the phones-down timer' : 'Walk to the haunt entrance first'} />
                    )}
                    <NightButton label={COPY.playInLine} variant="ghost" icon="play"
                      onPress={() => {
                        close();
                        RootNavigation.navigate('LinePlay', { ride: frightLinePlayRide(spot, event.park_id, Date.now()) });
                      }} />
                  </View>
                </View>
              </View>
            );
          })}
          {reefs.length > 0 && <Text style={styles.section}>Fright Reefs</Text>}
          {reefs.map(spot => {
            const found = me?.found_tonight.includes(spot.key);
            return (
              <View key={spot.key} style={styles.reefRow}>
                <GameIcon name={found ? 'check' : 'search'} size={18} />
                <Text style={styles.reefName}>{spot.name}</Text>
                <Text style={styles.meta}>{found ? 'Found tonight' : 'Stand still inside'}</Text>
              </View>
            );
          })}
          <View style={styles.toggle}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{COPY.spooky}</Text>
              <Text style={styles.meta}>{COPY.spookyHint}</Text>
            </View>
            <Switch value={engine.spooky} onValueChange={engine.setSpooky} accessibilityLabel={COPY.spooky}
              trackColor={{ true: NIGHT.pumpkin, false: NIGHT.dusk }} />
          </View>
          <NightButton label="Open my Deep Lantern" variant="ghost" icon="star" style={{ marginTop: 10 }}
            onPress={() => { close(); RootNavigation.navigate('FrightCard', { eventSlug: event.slug }); }} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: NIGHT.scrim },
  sheet: { maxHeight: '82%', backgroundColor: NIGHT.midnight, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    borderWidth: 3, borderColor: NIGHT.fog, paddingHorizontal: 16, paddingBottom: 28 },
  grab: { alignSelf: 'center', width: 44, height: 5, borderRadius: 3, backgroundColor: NIGHT.fog, marginVertical: 8 },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  title: { fontFamily: 'Shark', fontSize: 24, color: NIGHT.candy },
  sub: { fontFamily: 'Knockout', fontSize: 14, color: NIGHT.fogLight },
  runCard: { backgroundColor: NIGHT.haunt, borderRadius: 18, borderWidth: 2, borderColor: NIGHT.lantern, padding: 12, marginBottom: 10 },
  runName: { fontFamily: 'Shark', fontSize: 17, color: NIGHT.moon },
  runLine: { fontFamily: 'Knockout', fontSize: 15, color: NIGHT.fogLight, marginTop: 2 },
  row: { flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(185,168,230,0.25)' },
  bead: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: NIGHT.fog, alignItems: 'center',
    justifyContent: 'center', backgroundColor: NIGHT.haunt },
  beadLit: { backgroundColor: NIGHT.candy, borderColor: NIGHT.moon },
  beadText: { fontFamily: 'Shark', fontSize: 13, color: NIGHT.fogLight },
  name: { fontFamily: 'Shark', fontSize: 16, color: NIGHT.white },
  meta: { fontFamily: 'Knockout', fontSize: 13, color: NIGHT.fog },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  empty: { fontFamily: 'Knockout', fontSize: 16, color: NIGHT.fogLight, textAlign: 'center', marginVertical: 20 },
  section: { fontFamily: 'Shark', fontSize: 15, color: NIGHT.candy, marginTop: 14, marginBottom: 4, textTransform: 'uppercase' },
  reefRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  reefName: { flex: 1, fontFamily: 'Knockout', fontSize: 15, color: NIGHT.white },
  toggle: { flexDirection: 'row', alignItems: 'center', marginTop: 14, gap: 8 },
});
