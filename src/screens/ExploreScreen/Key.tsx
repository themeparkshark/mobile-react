import { Image } from 'expo-image';
import { useContext } from 'react';
import Countdown from 'react-countdown';
import { Text, View } from 'react-native';
import { TagSlot } from '../../components/map/declutter/Placed';
import type { TagPlacement } from '../../components/map/declutter/solver';
import { COIN_BODY, FIND_BOX, FIND_TAG } from './parkMapLayout';
import { FindFade, findClock, useFindExpiry } from './FindLife';
import { CurrencyContext } from '../../context/CurrencyProvider';
import { KeyType } from '../../models/key-type';

/**
 * Key — 100% STATIC layout (rendered inside <Marker>).
 * No Animated transforms — prevents teleporting on react-native-maps.
 */
export default function Key({
  model,
  onExpire,
  tag,
}: {
  readonly model: KeyType;
  readonly onExpire: () => void;
  /** Where the declutter put the timer chip (undefined: default, null: hidden). */
  readonly tag?: TagPlacement | null;
}) {
  const { currencies } = useContext(CurrencyContext);

  // At zero the find fades out and leaves (no 0:00 chip).
  const gone = useFindExpiry(model.active_to, onExpire);

  return (
    <FindFade gone={gone}>
      {/* Timer chip: the declutter places it on a free side (TagSlot). */}
      <TagSlot tag={tag} anchor={FIND_BOX.anchor} width={FIND_TAG.w} height={FIND_TAG.h}
        fallback={{ x: -FIND_TAG.w / 2, y: COIN_BODY.y - FIND_TAG.h - 3 }}>
        <View style={{
          backgroundColor: '#E8F4FD',
          borderRadius: 12,
          paddingHorizontal: 12,
          paddingVertical: 5,
          borderWidth: 2,
          borderColor: '#4FC3F7',
          shadowColor: '#4FC3F7',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 4,
          elevation: 4,
        }}>
          <Countdown
            date={Date.parse(model.active_to)}
            renderer={({ total }) => (
              <Text style={{
                fontFamily: 'Shark',
                fontSize: 15,
                color: '#0288D1',
                textAlign: 'center',
              }}>
                {findClock(total)}
              </Text>
            )}
          />
        </View>
      </TagSlot>

      {/* Key with static glow */}
      <View>
        <View style={{
          position: 'absolute',
          top: -4,
          left: -4,
          right: -4,
          bottom: -4,
          borderRadius: 20,
          backgroundColor: '#4FC3F7',
          opacity: 0.5,
        }} />
        <Image
          source={{ uri: currencies[1]?.map_url }}
          style={{
            width: 34,
            height: 34,
          }}
          contentFit="contain"
        />
      </View>
    </FindFade>
  );
}
