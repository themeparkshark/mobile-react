import { boxFraction, headlineBox, type TrailState } from '../../services/trail/trailModel';
import type { MapTrail } from './TrailBoxBadge';

/** The Trail Box cue on the map shark, from the steps stream's state: the box that fills soonest, its tier and fill. */
export function mapTrailOf(state: Pick<TrailState, 'walking' | 'ready'> | null | undefined, enabled: boolean): MapTrail | null {
  if (!enabled || !state) return null;
  const walking = state.walking.length > 0;
  const box = walking ? headlineBox({ ready: [], walking: state.walking }) : null;
  return { walking, tier: box?.tier ?? null, progress: box ? boxFraction(box) : 0, readyCount: state.ready.length };
}
