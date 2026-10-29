/**
 * The Standings podium steps: three plain cream steps with a white rim and a gold, silver or
 * bronze top edge, 2nd on the left, 1st in the middle (tallest), 3rd on the right. They replace
 * the gold barrels and coin piles (Dustin, Oct 28, ledger 38): no pile of money on a kid's
 * board. The crowns over the sharks (Alex's crown art) still say the place. Drawn from the
 * board's own UI pieces (the cream card, the white rim, the gold lip), so no new art.
 */
import { memo } from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { BRAND } from '../../ui';

export type StepRank = 1 | 2 | 3;

/** Each step's top edge: gold, silver, bronze (the crown colors). */
export const STEP_EDGE: Record<StepRank, string> = { 1: BRAND.gold, 2: '#c4d3e3', 3: '#e3a066' };

export interface PodiumStep {
  readonly rank: StepRank;
  /** How tall the step stands, in points, from the bottom of the stage. */
  readonly height: number;
  /** A fixed width, or a flex share of the row (pre-v2 boards lay their spots out by flex). */
  readonly width?: number;
  readonly flex?: number;
}

function PodiumSteps({ steps, gap = 6, style, paddingHorizontal = 0, numberAt = 'bottom' }: {
  /** Left to right, as they stand. */
  readonly steps: readonly PodiumStep[];
  /**
   * Where the place number sits: at the step's foot (the board), or right under its colored top
   * edge (a framed stage whose rounded bottom can hide the foot, like the help page picture).
   */
  readonly numberAt?: 'top' | 'bottom';
  readonly gap?: number;
  readonly paddingHorizontal?: number;
  readonly style?: ViewStyle;
}) {
  return (
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
      testID="podium-steps" style={[{ position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row',
        alignItems: 'flex-end', justifyContent: 'center', gap, paddingHorizontal }, style]}>
      {steps.map(step => (
        <View key={step.rank} style={{ width: step.width, flex: step.width ? undefined : step.flex ?? 1, height: step.height,
          backgroundColor: BRAND.cream, borderTopLeftRadius: 16, borderTopRightRadius: 16, borderWidth: 3, borderBottomWidth: 0,
          borderColor: BRAND.white, overflow: 'hidden', alignItems: 'center',
          justifyContent: numberAt === 'top' ? 'flex-start' : 'flex-end', paddingTop: numberAt === 'top' ? 8 : 0 }}>
          {/* The step's top edge in its place color, like a medal ribbon. */}
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 7, backgroundColor: STEP_EDGE[step.rank] }} />
          {(numberAt === 'top' || step.height >= 24) && <Text allowFontScaling={false} style={{ fontFamily: 'Shark',
            // The small top number on the help podium reads at a glance on SE (a 7-year-old reads 2, 1, 3);
            // the big step number on Standings stays a soft watermark.
            color: numberAt === 'top' ? 'rgba(5,52,110,0.55)' : 'rgba(5,52,110,0.32)', marginBottom: 1,
            fontSize: numberAt === 'top' ? 18 : Math.min(40, Math.max(14, Math.round(step.height * 0.32))),
            lineHeight: numberAt === 'top' ? 20 : undefined }}>{step.rank}</Text>}
        </View>
      ))}
    </View>
  );
}

export default memo(PodiumSteps);
