/**
 * The Standings podium: Alex's coin barrels under the top three, the look Dustin played at
 * Disneyland in OTA 2 (Nov 19: "I liked what we used to have"). This one part draws the podium
 * for every Standings surface: the board's mini podium, the park, Home Hunt and older boards, the
 * empty board and the help page. Nothing else draws a podium, so the look changes in one place.
 *
 * Two cuts of the same art, crop only (ART_RULES):
 * - 'tops': the barrels flipped and re-lit from the top left (ART_QA round 4), so silver stands on
 *   the taller left barrel and the bases read 2, 1, 3 like the board's spots. Cut above the painted
 *   digits (they read backwards in the flip), so only the coin rims and lids show.
 * - 'numbered': Alex's original barrels with their painted 3, 1, 2, for the boards whose spots
 *   stand 3, 1, 2 and for the empty board's little podium.
 *
 * The art is a picture only: the words around it stay calm (wins, ride coins, Top 3), never
 * money or prize talk.
 */
import { memo } from 'react';
import { Image, View, type ViewStyle } from 'react-native';

export type PodiumCut = 'tops' | 'numbered';

const BARREL_ART: Record<PodiumCut, number> = {
  tops: require('../../../assets/images/screens/leaderboard/barrel-flipped.png'),
  numbered: require('../../../assets/images/screens/leaderboard/barrel.png'),
};

/** Height over width of the barrel art (1079 x 683 px). */
export const BARREL_ASPECT = 683 / 1079;
/** The share of the art's height the 'tops' cut shows: rims and lids, above the painted digits (100 pt at 402 pt wide). */
export const BARREL_TOPS_SHOWN = 0.394;
/**
 * How far down the art (share of its height) each barrel's coin top sits in the 'tops' cut, so a
 * picture can stand a shark on it: the tall middle barrel, then the left, then the right.
 */
export const BARREL_TOPS_SEAT: Record<1 | 2 | 3, number> = { 1: 0.07, 2: 0.3, 3: 0.33 };

function PodiumBarrels({ cut, width, height, style }: {
  readonly cut: PodiumCut;
  /** The art's width in points (it fills this width and keeps its shape). */
  readonly width: number;
  /** How much of the art shows, from its top, in points. */
  readonly height: number;
  readonly style?: ViewStyle;
}) {
  // Cover from the top: the art keeps its shape, fills the box and shows its top first.
  const artHeight = Math.max(width * BARREL_ASPECT, height);
  const artWidth = artHeight / BARREL_ASPECT;
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      testID="podium-barrels" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, height, overflow: 'hidden', alignItems: 'center' }, style]}>
      <Image source={BARREL_ART[cut]} fadeDuration={0} resizeMode="cover" style={{ width: artWidth, height: artHeight }} />
    </View>
  );
}

export default memo(PodiumBarrels);
