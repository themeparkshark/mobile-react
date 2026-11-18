/**
 * The team offer as a step inside the win card (fix round W3, T034). It
 * never opens by itself on the map or mid-walk: after a new coin, a player
 * with no team taps NEXT COIN (or See my shelf) and this same card turns into
 * the team pick, then goes on where they were going. Once per player
 * (teamOffer.ts). Joining is for keeps, so a team is chosen with one tap and
 * joined with a second; LATER always goes on. Built from the kit: the team
 * badges, YellowButton, cream rows like the reward chips, motion.ts springs.
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import TeamBadge from '../TeamBadge';
import YellowButton from '../YellowButton';
import { TEAMS, teamName, type TeamId } from '../../constants/teams';
import { joinTeam } from '../../api/endpoints/gym-battle';
import { TEAM_STEP_ORDER, TEAM_STEP_VIBE, teamJoinOutcome } from './winTeamModel';

export default function WinTeamStep({ reducedMotion, onDone }: {
  readonly reducedMotion: boolean;
  /** The step is over (joined or later): the card goes on to where the player was heading. */
  readonly onDone: (joined: TeamId | null) => void;
}) {
  const [picked, setPicked] = useState<TeamId | null>(null);
  const [stage, setStage] = useState<'pick' | 'joining' | 'done' | 'error'>('pick');
  const join = async () => {
    if (!picked || stage === 'joining') return;
    setStage('joining');
    let outcome: 'joined' | 'error';
    try { await joinTeam(picked); outcome = 'joined'; } catch (error) { outcome = teamJoinOutcome(error, picked); }
    if (outcome === 'joined') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setStage('done');
      setTimeout(() => onDone(picked), reducedMotion ? 600 : 1300);
    } else setStage('error');
  };
  if (stage === 'done' && picked) {
    return (
      <Animated.View entering={reducedMotion ? FadeIn.duration(120) : ZoomIn.springify().damping(12).stiffness(220)} style={styles.done}
        accessible accessibilityRole="alert" accessibilityLabel={`Welcome to ${teamName(picked)}!`}>
        <TeamBadge team={picked} size={96} />
        <Text style={styles.doneTitle}>{`Welcome to ${teamName(picked)}!`}</Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View entering={reducedMotion ? FadeIn.duration(120) : FadeIn.duration(220)} style={styles.wrap}>
      {/* The card's ribbon says "Pick Your Team!" (one title, never two). */}
      <Text style={styles.sub}>Every coin you win helps your team.</Text>
      {TEAM_STEP_ORDER.map(team => (
        <Pressable key={team} onPress={() => { void Haptics.selectionAsync().catch(() => undefined); setPicked(team); }}
          accessibilityRole="button" accessibilityState={{ selected: picked === team }}
          accessibilityLabel={`${teamName(team)}. ${TEAM_STEP_VIBE[team]}`}
          style={[styles.row, picked === team && styles.rowPicked]}>
          <TeamBadge team={team} size={48} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.rowName, { color: TEAMS[team].color }]} numberOfLines={1}>{teamName(team)}</Text>
            <Text style={styles.rowVibe} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{TEAM_STEP_VIBE[team]}</Text>
          </View>
        </Pressable>
      ))}
      {picked ? <View style={styles.cta}>
        <YellowButton text={stage === 'joining' ? 'One moment' : `Join ${teamName(picked)}`} disabled={stage === 'joining'} onPress={() => { void join(); }} />
        <Text style={styles.keeps}>{stage === 'error' ? 'That did not go through. Tap Join again.' : 'This is for keeps.'}</Text>
      </View> : null}
      <Pressable onPress={() => onDone(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Later" style={styles.later}>
        <Text style={styles.laterText}>LATER</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: 'stretch', alignItems: 'center', paddingTop: 4 },
  title: { fontFamily: 'Shark', fontSize: 26, color: '#ffe07a', textAlign: 'center', textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
  sub: { fontFamily: 'Knockout', fontSize: 16, color: '#ffffff', textAlign: 'center', marginBottom: 6 },
  row: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff8e4', borderRadius: 16,
    borderWidth: 3, borderColor: '#ffffff', borderBottomWidth: 5, borderBottomColor: '#9ccbe9', paddingVertical: 6, paddingHorizontal: 10, marginTop: 6 },
  rowPicked: { borderColor: '#ffcf3b', borderBottomColor: '#d99a00' },
  rowName: { fontFamily: 'Shark', fontSize: 20 },
  rowVibe: { fontFamily: 'Knockout', fontSize: 14, color: '#3d5f8c' },
  cta: { alignSelf: 'stretch', marginTop: 10 },
  keeps: { fontFamily: 'Knockout', fontSize: 14, color: '#cdeaff', textAlign: 'center', marginTop: 2 },
  later: { marginTop: 8, paddingVertical: 6, paddingHorizontal: 16 },
  laterText: { fontFamily: 'Shark', fontSize: 17, color: '#ffffff' },
  done: { alignItems: 'center', paddingVertical: 18 },
  doneTitle: { fontFamily: 'Shark', fontSize: 24, color: '#ffffff', textAlign: 'center', marginTop: 10, textShadowColor: '#05346e',
    textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 0.1 },
});
