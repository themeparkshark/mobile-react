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
  /** Ride islands on the map; the beacon settles clear of them so no ride is hidden. */
  readonly avoid?: readonly { readonly latitude: number; readonly longitude: number }[];
}

type Point = { latitude: number; longitude: number };
const EARTH_M = 6_371_000;
function metersBetween(a: Point, b: Point) {
  const toRad = Math.PI / 180, dLat = (b.latitude - a.latitude) * toRad, dLng = (b.longitude - a.longitude) * toRad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.latitude * toRad) * Math.cos(b.latitude * toRad) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_M * Math.asin(Math.min(1, Math.sqrt(h)));
}
function offset(from: Point, meters: number, bearingDeg: number): Point {
  const b = bearingDeg * Math.PI / 180;
  return {
    latitude: from.latitude + (meters * Math.cos(b)) / EARTH_M * (180 / Math.PI),
    longitude: from.longitude + (meters * Math.sin(b)) / (EARTH_M * Math.cos(from.latitude * Math.PI / 180)) * (180 / Math.PI),
  };
}

/**
 * The beacon marks the park's story, not a ride, so it can move a little. When
 * a ride island sits within `clear` meters (about one island width at park
 * zoom), try rings of 8 bearings out to 3x that distance and take the first
 * spot clear of every island; if none is clear, take the spot farthest from
 * the nearest island.
 */
export function placeBeacon(center: Point, avoid: readonly Point[], clear = 70): Point {
  const nearest = (point: Point) => avoid.reduce((min, ride) => Math.min(min, metersBetween(point, ride)), Infinity);
  if (nearest(center) >= clear) return center;
  let best = center, bestGap = nearest(center);
  for (const ring of [1, 1.5, 2, 3]) {
    for (let step = 0; step < 8; step += 1) {
      const candidate = offset(center, clear * ring, step * 45);
      const gap = nearest(candidate);
      if (gap >= clear) return candidate;
      if (gap > bestGap) { best = candidate; bestGap = gap; }
    }
  }
  return best;
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
export default function ParkProjectMapBeacon({ project, onPress, avoid = [] }: Props) {
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
  const coordinate = placeBeacon({ latitude, longitude },
    avoid.filter(ride => Number.isFinite(ride.latitude) && Number.isFinite(ride.longitude)));
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
      </View>
      {/* The label rides on its own white tag so map glyphs never print across it. */}
      <View style={[styles.labelTag, { borderColor: appearance.background }]}>
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
  labelTag: { alignSelf: 'center', marginTop: -12, backgroundColor: '#ffffff', borderWidth: 2, borderRadius: 9,
    paddingHorizontal: 7, paddingVertical: 1 },
  label: { color: '#0b3d70', fontFamily: 'Knockout', fontSize: 12, letterSpacing: 0.8 },
});
