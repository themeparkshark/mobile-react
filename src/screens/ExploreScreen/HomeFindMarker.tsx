import { memo, useCallback, useMemo } from 'react';
import { Marker } from '../../components/map/Marker';
import type { PrepItemType } from '../../models/prep-item-type';
import PrepItemMarker, { PREP_MARKER_ANCHOR, type FingerSide } from './PrepItem';
import { rideSpec } from './ridePhoto';

/** "Mac and Cheese Cone, Rare, ride photo, in range" or "Nachos, Uncommon, 65 meters away". */
export function findLabel(item: PrepItemType, distance: number | null, inRange: boolean): string {
  const rarity = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][Math.max(1, Math.min(5, Math.round(item.rarity || 1))) - 1];
  const photo = rideSpec(item.rarity).style === 'ride_photo' ? ', ride photo' : '';
  if (inRange) return `${item.name}, ${rarity}${photo}, in range. Tap to catch.`;
  return `${item.name}, ${rarity}${photo}, ${distance == null ? 'distance unknown' : `${Math.round(distance)} meters away`}`;
}

/**
 * One find on the home map, memoized: GPS ticks re-render it only when its
 * own range, rounded distance, motion budget or hidden state changes.
 */
function HomeFindMarker({ item, distance, inRange, animated, hidden, onTap, onExpire, fingerSide = 'right', count = 1, chromeless = false, showFinger = true }: {
  readonly item: PrepItemType;
  readonly distance: number | null;
  readonly inRange: boolean;
  readonly animated: boolean;
  readonly hidden: boolean;
  readonly onTap: (item: PrepItemType, distance: number | null, inRange: boolean) => void;
  readonly onExpire: () => void;
  readonly fingerSide?: FingerSide;
  /** Overlapping finds collapse into this one marker. */
  readonly count?: number;
  /** Under the header: art only. */
  readonly chromeless?: boolean;
  readonly showFinger?: boolean;
}) {
  const coordinate = useMemo(() => ({ latitude: item.latitude!, longitude: item.longitude! }), [item.latitude, item.longitude]);
  const press = useCallback(() => onTap(item, distance, inRange), [onTap, item, distance, inRange]);
  return (
    // Kids press and hold: a long-press is the same as a tap (no report dialog here).
    <Marker coordinate={coordinate} anchor={PREP_MARKER_ANCHOR} onPress={press} onLongPress={press}
      accessibilityLabel={findLabel(item, distance, inRange)}>
      <PrepItemMarker prepItem={item} onExpire={onExpire} inRange={inRange} animated={animated} hidden={hidden} fingerSide={fingerSide} count={count} chromeless={chromeless} showFinger={showFinger} />
    </Marker>
  );
}

export default memo(HomeFindMarker);
