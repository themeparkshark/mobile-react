import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { TagSlot } from '../../components/map/declutter/Placed';
import type { TagPlacement } from '../../components/map/declutter/solver';
import { REDEEMABLE_BODY, FIND_BOX, FIND_TAG } from './parkMapLayout';
import { FindFade, FindSoonChip, useFindExpiry } from './FindLife';
import { RedeemableType } from '../../models/redeemable-type';

/**
 * Redeemable (swords/task items) — 100% STATIC layout (rendered inside <Marker>).
 * No Animated transforms — prevents teleporting on react-native-maps.
 */
export default function Redeemable({
  redeemable,
  onExpire,
  tag,
}: {
  readonly redeemable: RedeemableType;
  readonly onExpire: () => void;
  /** Where the declutter put the timer chip (undefined: default, null: hidden). */
  readonly tag?: TagPlacement | null;
}) {
  // At zero the find fades out and leaves (no 0:00 chip).
  const gone = useFindExpiry(redeemable.active_to, onExpire);

  const themeColor = redeemable.theme?.currency?.color || '#9C27B0';

  return (
    <FindFade gone={gone}>
      {/* Timer chip: the declutter places it on a free side (TagSlot). */}
      <TagSlot tag={tag} anchor={FIND_BOX.anchor} width={FIND_TAG.w} height={FIND_TAG.h}
        fallback={{ x: -FIND_TAG.w / 2, y: REDEEMABLE_BODY.y - FIND_TAG.h - 3 }}>
        {/* No clock on the map (T006): words, and only in the last ten minutes. */}
        <FindSoonChip activeTo={redeemable.active_to} tone="gold" />
      </TagSlot>

      {/* Redeemable with static glow */}
      <View>
        <View style={{
          position: 'absolute',
          top: -8,
          left: -8,
          right: -8,
          bottom: -8,
          borderRadius: 35,
          backgroundColor: themeColor,
          opacity: 0.4,
        }} />
        <Image
          source={{ uri: redeemable.theme?.currency?.map_url }}
          style={{
            width: 50,
            height: 50,
          }}
          contentFit="contain"
        />
      </View>
    </FindFade>
  );
}
