import type { ImageSourcePropType } from 'react-native';

/** A ride island the following shark may stand on (T011). */
export interface UnderShark {
  readonly key: string | number;
  readonly latitude: number;
  readonly longitude: number;
  readonly coin: ImageSourcePropType;
  readonly label: string;
  readonly onPress: () => void;
}

/** The island's art is hidden by the shark when its point is this close on screen (points). */
export const UNDER_SHARK_PT = 46;

/** Pure: is the island this many metres away hidden under the shark at this zoom (points per metre)? */
export function islandUnderShark(metres: number, pointsPerMeter: number): boolean {
  return Number.isFinite(metres) && Number.isFinite(pointsPerMeter) && metres * pointsPerMeter <= UNDER_SHARK_PT;
}
