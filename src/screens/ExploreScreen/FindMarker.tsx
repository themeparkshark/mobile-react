import { memo, type ReactNode } from 'react';
import { Marker } from '../../components/map/Marker';
import { Placed, usePlacement } from '../../components/map/declutter/Placed';
import type { TagPlacement } from '../../components/map/declutter/solver';
import { FIND_BOX } from './parkMapLayout';

/**
 * A timed find on the park map (coin, key, redeemable): the art centred on its
 * spot, faded or kept by the declutter, its timer chip on the side the solver
 * picked. Only this marker re-renders when its placement changes.
 */
function FindMarker({ id, latitude, longitude, children }: {
  /** Declutter id, e.g. "coin:12" (parkMapLayout). */
  readonly id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly children: (tag: TagPlacement | null | undefined) => ReactNode;
}) {
  const placement = usePlacement(id);
  return (
    <Marker coordinate={{ latitude, longitude }} anchor={{ x: 0.5, y: 0.5 }}>
      <Placed placement={placement} anchor={FIND_BOX.anchor} style={{ width: FIND_BOX.width, height: FIND_BOX.height }}>
        {children(placement.tag)}
      </Placed>
    </Marker>
  );
}

export default memo(FindMarker);
