import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle } from '../../components/map/Circle';
import { Marker } from '../../components/map/Marker';
import type { ParkProject } from '../../api/endpoints/me/park-projects';

interface Props {
  readonly project: Pick<ParkProject,
    'id' | 'slug' | 'title' | 'stage' | 'play_chapter' | 'park_latitude' | 'park_longitude' | 'ended'>;
  readonly onPress: () => void;
}

const PHASES = [
  { color: '#71B6D9', fill: 'rgba(113,182,217,0.07)', innerFill: 'rgba(113,182,217,0.12)',
    background: '#0b6fb8', symbol: '✦', label: 'SIGNAL' },
  { color: '#5CD4CF', fill: 'rgba(92,212,207,0.09)', innerFill: 'rgba(92,212,207,0.17)',
    background: '#087eac', symbol: '✧', label: 'CLUE' },
  { color: '#FFCB47', fill: 'rgba(255,203,71,0.10)', innerFill: 'rgba(255,203,71,0.20)',
    background: '#096cab', symbol: '✦', label: 'VOTE' },
  { color: '#BD91FF', fill: 'rgba(189,145,255,0.11)', innerFill: 'rgba(189,145,255,0.21)',
    background: '#6145a9', symbol: '✷', label: 'OPEN' },
] as const;
const OMEGA_PHASE = { color: '#ff9d73', fill: 'rgba(255,157,115,0.11)',
  innerFill: 'rgba(255,157,115,0.21)', background: '#8a4eae' } as const;
const OBSERVATORY_APPEARANCE = { color: '#79DCEB', fill: 'rgba(121,220,235,0.11)',
  innerFill: 'rgba(121,220,235,0.21)', background: '#16598C', symbol: '✦', label: 'TIDE' } as const;
const STORY_APPEARANCES = {
  'coral-passage-chapter': { color: '#ec8581', fill: 'rgba(236,133,129,0.11)',
    innerFill: 'rgba(236,133,129,0.21)', background: '#965169', symbol: '✿', label: 'REEF' },
  'echo-harbor-chapter': { color: '#6cbdeb', fill: 'rgba(108,189,235,0.11)',
    innerFill: 'rgba(108,189,235,0.21)', background: '#0b568f', symbol: '♫', label: 'ECHO' },
  'lantern-tide-chapter': { color: '#f5b957', fill: 'rgba(245,185,87,0.11)',
    innerFill: 'rgba(245,185,87,0.22)', background: '#975a18', symbol: '✧', label: 'TIDE' },
  'hidden-pulse-chapter': { color: '#a486e7', fill: 'rgba(164,134,231,0.11)',
    innerFill: 'rgba(164,134,231,0.21)', background: '#574395', symbol: '✦', label: 'PULSE' },
} as const;

/** Decorative community-state beacon at the park's stored center, never a queue or pickup target. */
export default function ParkProjectMapBeacon({ project, onPress }: Props) {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);
  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), 700);
    return () => clearTimeout(timer);
  }, [project.id, project.slug, project.stage, project.play_chapter]);

  const latitude = Number(project.park_latitude);
  const longitude = Number(project.park_longitude);
  if (project.ended || project.park_latitude == null || project.park_longitude == null ||
    !Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  const stage = Math.max(0, Math.min(3, project.stage));
  const phase = PHASES[stage];
  const story = project.slug.startsWith('observatory-') ? OBSERVATORY_APPEARANCE
    : STORY_APPEARANCES[project.slug as keyof typeof STORY_APPEARANCES];
  const appearance = story ?? (stage >= 2 && project.play_chapter === 'b'
    ? OMEGA_PHASE : phase);
  const branch = project.stage >= 2 ? project.play_chapter : null;
  const coordinate = { latitude, longitude };
  const size = 72 + stage * 5;

  return <>
    <Circle center={coordinate} radius={95 + stage * 55}
      strokeColor={appearance.color} fillColor={appearance.fill} strokeWidth={2} />
    <Circle center={coordinate} radius={55 + stage * 23}
      strokeColor={appearance.color} fillColor={appearance.innerFill} strokeWidth={3} />
    <Marker coordinate={coordinate} anchor={{ x: 0.5, y: 0.5 }} zIndex={5000}
      tracksViewChanges={tracksViewChanges} onPress={onPress}
      accessibilityLabel={`Park Project: ${project.title}, ${phase.label.toLowerCase()} stage${branch ? `, path ${branch.toUpperCase()}` : ''}. Open details.`}>
      <View style={[styles.beacon, { borderColor: appearance.color,
        backgroundColor: appearance.background, width: size, height: size, borderRadius: size / 2 }]}>
        <Text style={styles.symbol}>{branch === 'b' ? '✧' : story?.symbol ?? phase.symbol}</Text>
        <Text style={styles.label}>{story?.label ?? phase.label}</Text>
      </View>
    </Marker>
  </>;
}

const styles = StyleSheet.create({
  beacon: { borderWidth: 4, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#003b74', shadowOpacity: 0.35, shadowOffset: { width: 0, height: 4 },
    shadowRadius: 4, elevation: 5 },
  symbol: { color: '#fff', fontFamily: 'Shark', fontSize: 30, lineHeight: 35,
    textShadowColor: '#034779', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 1 },
  label: { color: '#ffdf4b', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8 },
});
