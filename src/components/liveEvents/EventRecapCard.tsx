import { memo, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import type { LiveEvent } from '../../api/endpoints/live-events';
import { TEAMS } from '../../constants/teams';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import useReducedGameMotion from '../../hooks/useReducedGameMotion';
import { goalWord, openableKeys, ordinal, teamPlace } from '../../services/liveEvents/model';
import { BRAND, GameIcon } from '../../ui';
import { eventArt } from './eventArt';

const KEY = (id: number) => `liveEvent.recap.${id}`;

/** Show the recap once per event, after it ends, to anyone who helped. */
export function useRecapDue(event: LiveEvent | null): [boolean, () => void] {
  const [due, setDue] = useState(false);
  const id = event?.id;
  const eligible = !!event && event.phase === 'ended' && event.me.points > 0;
  useEffect(() => {
    if (!eligible || id == null) { setDue(false); return; }
    let live = true;
    AsyncStorage.getItem(KEY(id)).then(v => { if (live) setDue(v !== '1'); }).catch(() => { if (live) setDue(true); });
    return () => { live = false; };
  }, [eligible, id]);
  const seen = () => { setDue(false); if (id != null) AsyncStorage.setItem(KEY(id), '1').catch(() => undefined); };
  return [due, seen];
}

/**
 * The end-of-event card: what YOU did ("You helped fill the reef! 64 points,
 * 3 chests"), how everyone did and how your team finished, then one button:
 * open the chests still waiting, or Nice.
 */
function EventRecapCard({ event, visible, onClose, onOpenChests }: {
  readonly event: LiveEvent; readonly visible: boolean; readonly onClose: () => void; readonly onOpenChests: () => void;
}) {
  const reduced = useReducedGameMotion();
  const art = eventArt(event.art_key);
  useEffect(() => { if (visible) { playSfx('win'); haptic('success'); } }, [visible]);
  const opened = event.me.chests.filter(c => c.claimed).length + event.together.chests.filter(c => c.claimed).length + (event.team_race?.claimed ? 1 : 0);
  const waiting = openableKeys(event).length;
  const togetherDone = event.together.chests.filter(c => c.reached).length;
  const race = event.team_race;
  const place = race ? teamPlace(race.scores, event.me.team) : null;
  const winner = race && race.winners.length === 1 ? race.winners[0] : null;
  const teamLine = !race || !event.me.team ? null
    : winner === event.me.team ? `${TEAMS[event.me.team].name} won!` : place ? `${TEAMS[event.me.team].name}: ${ordinal(place)}` : null;
  const enter = (d: number) => (reduced ? FadeIn : ZoomIn.delay(d).springify().damping(12));
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.scrim}>
        <View style={styles.card} accessibilityViewIsModal>
          <Image source={art.emblem} style={styles.emblem} contentFit="contain" />
          <Text style={styles.over}>{event.title} is over!</Text>
          <Text style={styles.big} accessibilityRole="header">You helped fill the {goalWord(event)}!</Text>
          <View style={styles.stats}>
            <Animated.View entering={enter(200)} style={styles.stat}><GameIcon name="star" size={28} /><Text style={styles.statNum}>{event.me.points}</Text><Text style={styles.statLbl}>points</Text></Animated.View>
            <Animated.View entering={enter(380)} style={styles.stat}><Image source={art.chestOpen} style={styles.statImg} contentFit="contain" /><Text style={styles.statNum}>{opened}</Text><Text style={styles.statLbl}>chests</Text></Animated.View>
            {event.together.chests.length > 0 && (
              <Animated.View entering={enter(560)} style={styles.stat}><GameIcon name="shark" size={28} /><Text style={styles.statNum}>{togetherDone}/{event.together.chests.length}</Text><Text style={styles.statLbl}>together</Text></Animated.View>
            )}
          </View>
          {teamLine && event.me.team && (
            <View style={styles.team}><Image source={TEAMS[event.me.team].badge} style={styles.crest} contentFit="contain" /><Text style={styles.teamText}>{teamLine}</Text></View>
          )}
          <Pressable accessibilityRole="button" onPress={waiting ? onOpenChests : onClose} style={({ pressed }) => [styles.button, pressed && { transform: [{ scale: 0.96 }] }]}>
            <Text style={styles.buttonText}>{waiting ? (waiting === 1 ? 'OPEN MY CHEST' : `OPEN ${waiting} CHESTS`) : 'NICE!'}</Text>
          </Pressable>
          {waiting > 0 && <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button" style={styles.later}><Text style={styles.laterText}>Later</Text></Pressable>}
        </View>
      </View>
    </Modal>
  );
}

export default memo(EventRecapCard);

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(8,56,128,0.55)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  card: { width: '100%', maxWidth: 340, alignItems: 'center', backgroundColor: BRAND.cream, borderRadius: 28, borderWidth: 4, borderColor: BRAND.navy, padding: 18, paddingTop: 0 },
  emblem: { width: 120, height: 120, marginTop: -56 },
  over: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft },
  big: { fontFamily: 'Shark', fontSize: 24, color: BRAND.navy, textAlign: 'center', marginTop: 2 },
  stats: { flexDirection: 'row', gap: 10, marginTop: 14 },
  stat: { width: 88, alignItems: 'center', backgroundColor: BRAND.white, borderRadius: 18, borderWidth: 3, borderColor: BRAND.navy, paddingVertical: 8 },
  statImg: { width: 30, height: 30 },
  statNum: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy },
  statLbl: { fontFamily: 'Knockout', fontSize: 13, color: BRAND.navySoft },
  team: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 },
  crest: { width: 30, height: 30 },
  teamText: { fontFamily: 'Shark', fontSize: 17, color: BRAND.navy },
  button: { marginTop: 16, alignSelf: 'stretch', alignItems: 'center', backgroundColor: BRAND.gold, borderRadius: 18, borderWidth: 3, borderColor: BRAND.white,
    borderBottomWidth: 6, borderBottomColor: BRAND.goldLip, paddingVertical: 10, minHeight: 52 },
  buttonText: { fontFamily: 'Shark', fontSize: 19, color: BRAND.navy },
  later: { marginTop: 8, minHeight: 36, justifyContent: 'center' },
  laterText: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft, textDecorationLine: 'underline' },
});
