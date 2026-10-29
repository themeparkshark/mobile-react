/**
 * The Rewards button (core loop blueprint 4.2 and 4.3, October 2026): one chest with one number.
 *
 * Chests, dailies and boxes stop popping over the map. They wait here: the daily chest, Daily 3
 * and its chests, the Weekly Box, Trail Boxes and stamps to claim. The number counts what can be
 * claimed right now and clears the moment it is claimed (a red dot means "claim now"; this uses the
 * gold count in the house style). The flame shows on the button once Daily 3 unlocks (rung 4), and a
 * thin ring fills as a Trail Box walks once Trail Boxes unlock (rung 6).
 * It replaces the map's chest button and the Daily 3 flame button in the right column, in their
 * size and style (54 pt round, blue with the white border).
 * The ring is a static SVG (no animated SVG props: the reanimated 3.16.7 RNSVG onLayout crash).
 */
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { haptic } from '../../gamekit/Haptics';
import { BRAND, GameIcon, SHADOW } from '../../ui';
import NewTag from './NewTag';

const CHEST = require('../../../assets/images/daily/chest-closed.png');
const SIZE = 54;
const RING = 4;

/** What the button shows: one number, the flame (after rung 4), the Trail ring (after rung 6). */
export interface RewardsButtonModel {
  /** Things to claim right now (0 hides the number). */
  readonly count: number;
  /** The flame's one number, or null before Daily 3 unlocks. */
  readonly flame: number | null;
  /** How far the nearest Trail Box has walked (0 to 1), or null before Trail Boxes unlock. */
  readonly trail: number | null;
}

/**
 * The Rewards sheet's own summary (rewards-unlocks: useRetention().rewards), when the build has it:
 * it knows every row (Daily 3 chest, level chest, Weekly Box, stamps, event chests), so its number
 * wins over the map's own count. Pure.
 */
export function withRewardsSummary(model: RewardsButtonModel, summary: unknown): RewardsButtonModel {
  if (!summary || typeof summary !== 'object') return model;
  const s = summary as { count?: unknown; flame?: unknown; trailRing?: unknown };
  if (typeof s.count !== 'number' || !Number.isFinite(s.count)) return model;
  const flame = typeof s.flame === 'number' && Number.isFinite(s.flame) ? Math.max(0, Math.floor(s.flame)) : s.flame === null ? null : model.flame;
  const trail = typeof s.trailRing === 'number' && Number.isFinite(s.trailRing) ? Math.max(0, Math.min(1, s.trailRing))
    : s.trailRing === null ? null : model.trail;
  return { count: Math.max(0, Math.floor(s.count)), flame, trail };
}

/** Pure: the button's model from what the map knows. */
export function rewardsButtonModel(input: {
  readonly chestUnclaimed: boolean;
  readonly trailReady: number;
  readonly dailyOpen: boolean;
  readonly flame: number | null | undefined;
  readonly trailOpen: boolean;
  readonly trailProgress: number | null | undefined;
  /** Other claimables (Daily 3 chest, level chest, stamps) when the map knows them. */
  readonly otherClaims?: number;
}): RewardsButtonModel {
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);
  const count = (input.chestUnclaimed ? 1 : 0) + (input.trailOpen ? n(input.trailReady) : 0) + n(input.otherClaims);
  const flame = input.dailyOpen ? n(input.flame) : null;
  const p = typeof input.trailProgress === 'number' && Number.isFinite(input.trailProgress) ? Math.max(0, Math.min(1, input.trailProgress)) : null;
  return { count, flame, trail: input.trailOpen ? p : null };
}

export function rewardsLabel(model: RewardsButtonModel): string {
  const parts = ['Rewards'];
  parts.push(model.count > 0 ? `${model.count} to claim` : 'nothing to claim right now');
  if (model.flame !== null) parts.push(`flame ${model.flame}`);
  if (model.trail !== null) parts.push(`Trail Box ${Math.round(model.trail * 100)} percent walked`);
  return parts.join(', ');
}

export default function RewardsButton({ model, onPress, isNew = false }: {
  readonly model: RewardsButtonModel; readonly onPress: () => void;
  /** The flame (rung 4) or the Trail ring (rung 6) just unlocked: the button wears NEW until tapped. */
  readonly isNew?: boolean;
}) {
  const r = (SIZE + RING) / 2 - RING / 2;
  const circumference = 2 * Math.PI * r;
  return (
    <Pressable onPress={() => { haptic('tapLight'); onPress(); }} accessibilityRole="button"
      accessibilityLabel={`${isNew ? 'New. ' : ''}${rewardsLabel(model)}`} hitSlop={6} testID="map-rewards-button"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      {model.trail !== null && <View style={styles.ring} pointerEvents="none">
        <Svg width={SIZE + RING} height={SIZE + RING}>
          <Circle cx={(SIZE + RING) / 2} cy={(SIZE + RING) / 2} r={r} stroke={BRAND.gold} strokeWidth={RING} fill="none"
            strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - model.trail)}
            strokeLinecap="round" transform={`rotate(-90 ${(SIZE + RING) / 2} ${(SIZE + RING) / 2})`} />
        </Svg>
      </View>}
      <Image source={CHEST} style={styles.chest} contentFit="contain" transition={0} />
      {isNew && <NewTag style={styles.newTag} />}
      {model.count > 0 && <View style={styles.count} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <Text style={styles.countText}>{model.count > 9 ? '9+' : model.count}</Text>
      </View>}
      {model.flame !== null && <View style={styles.flame} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        <GameIcon name="streak" size={16} />
        <Text style={styles.flameText}>{model.flame}</Text>
      </View>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { width: SIZE, height: SIZE, borderRadius: SIZE / 2, alignItems: 'center', justifyContent: 'center',
    backgroundColor: BRAND.blueBright, borderWidth: 3, borderColor: BRAND.white, ...SHADOW.card },
  pressed: { transform: [{ scale: 0.94 }] },
  chest: { width: 36, height: 36 },
  ring: { position: 'absolute', left: -RING / 2 - 3, top: -RING / 2 - 3 },
  count: { position: 'absolute', top: -6, right: -6, minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 4,
    backgroundColor: BRAND.gold, borderWidth: 2.5, borderColor: BRAND.white, alignItems: 'center', justifyContent: 'center' },
  countText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 12 },
  flame: { position: 'absolute', bottom: -8, left: -8, flexDirection: 'row', alignItems: 'center', backgroundColor: BRAND.white,
    borderRadius: 10, paddingRight: 5, paddingLeft: 1, borderWidth: 2, borderColor: BRAND.blueBright },
  newTag: { top: -8, left: -10 },
  flameText: { color: BRAND.navy, fontFamily: 'Shark', fontSize: 11 },
});
