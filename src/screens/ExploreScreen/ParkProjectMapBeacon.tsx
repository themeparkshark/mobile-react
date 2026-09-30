import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle } from '../../components/map/Circle';
import { Marker } from '../../components/map/Marker';
import type { ParkProject } from '../../api/endpoints/me/park-projects';
import { GameIcon } from '../../ui';

interface Props {
  readonly project: Pick<ParkProject,
    'id' | 'slug' | 'title' | 'stage' | 'play_chapter' | 'park_latitude' | 'park_longitude' | 'ended'>;
  readonly onPress: () => void;
}

const PHASES = [
  { color: '#71B6D9', fill: 'rgba(113,182,217,0.07)', innerFill: 'rgba(113,182,217,0.12)',
    background: '#0b6fb8', symbol: 'sparkle', label: 'SIGNAL' },
  { color: '#5CD4CF', fill: 'rgba(92,212,207,0.09)', innerFill: 'rgba(92,212,207,0.17)',
    background: '#087eac', symbol: 'search', label: 'CLUE' },
  { color: '#FFCB47', fill: 'rgba(255,203,71,0.10)', innerFill: 'rgba(255,203,71,0.20)',
    background: '#096cab', symbol: 'star', label: 'VOTE' },
  { color: '#ffe07a', fill: 'rgba(255,224,122,0.12)', innerFill: 'rgba(255,224,122,0.22)',
    background: '#0768b9', symbol: 'chestOpen', label: 'OPEN' },
] as const;
const OMEGA_PHASE = { color: '#ff9d73', fill: 'rgba(255,157,115,0.11)',
  innerFill: 'rgba(255,157,115,0.21)', background: '#0a77bf' } as const;
const OBSERVATORY_APPEARANCE = { color: '#79DCEB', fill: 'rgba(121,220,235,0.11)',
  innerFill: 'rgba(121,220,235,0.21)', background: '#16598C', symbol: 'map', label: 'TIDE' } as const;
const STORY_APPEARANCES = {
  'coral-passage-chapter': { color: '#ec8581', fill: 'rgba(236,133,129,0.11)',
    innerFill: 'rgba(236,133,129,0.21)', background: '#0b6fb8', symbol: 'fin', label: 'REEF' },
  'echo-harbor-chapter': { color: '#6cbdeb', fill: 'rgba(108,189,235,0.11)',
    innerFill: 'rgba(108,189,235,0.21)', background: '#0b568f', symbol: 'bell', label: 'ECHO' },
  'lantern-tide-chapter': { color: '#f5b957', fill: 'rgba(245,185,87,0.11)',
    innerFill: 'rgba(245,185,87,0.22)', background: '#0a77bf', symbol: 'sparkle', label: 'TIDE' },
  'hidden-pulse-chapter': { color: '#5CD4CF', fill: 'rgba(92,212,207,0.11)',
    innerFill: 'rgba(92,212,207,0.21)', background: '#087eac', symbol: 'sparkle', label: 'PULSE' },
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
        <GameIcon name={branch === 'b' ? 'sparkle' : story?.symbol ?? phase.symbol} size={32} style={styles.symbol} />
        <Text style={styles.label}>{story?.label ?? phase.label}</Text>
      </View>
    </Marker>
  </>;
}

const styles = StyleSheet.create({
  beacon: { borderWidth: 4, justifyContent: 'center', alignItems: 'center',
    shadowColor: '#003b74', shadowOpacity: 0.35, shadowOffset: { width: 0, height: 4 },
    shadowRadius: 4, elevation: 5 },
  symbol: { marginBottom: 1 },
  label: { color: '#ffdf4b', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8 },
});
