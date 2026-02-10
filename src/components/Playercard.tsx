import { Image } from 'expo-image';
import { useCallback, useEffect, useRef } from 'react';
import { Animated, GestureResponderEvent, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { InventoryType } from '../models/inventory-type';
import { ItemType } from '../models/item-type';

// Tap zone map — Y percentage ranges on the shark for each slot
// Checked top-to-bottom; first match wins
// Hands use X position (far left/right sides) at mid-body height
const SLOT_ZONES: { slot: string; yMin: number; yMax: number; xMin?: number; xMax?: number }[] = [
  { slot: 'head_item',  yMin: 0,    yMax: 0.28, xMin: 0.42, xMax: 0.82 },
  { slot: 'face_item',  yMin: 0.10, yMax: 0.40, xMin: 0.18, xMax: 0.60 },
  { slot: 'hand_item',  yMin: 0.40, yMax: 0.68, xMin: 0, xMax: 0.38 },   // left fin
  { slot: 'hand_item',  yMin: 0.40, yMax: 0.68, xMin: 0.68, xMax: 1.0 }, // right fin
  { slot: 'neck_item',  yMin: 0.38, yMax: 0.63, xMin: 0.38, xMax: 0.70 }, // overlaps body, checked first
  { slot: 'body_item',  yMin: 0.50, yMax: 0.66, xMin: 0.36, xMax: 0.68 },
];

export default function Playercard({
  inventory,
  style,
  showBackground = true,
  sharkTransform,
  onItemTap,
}: {
  readonly inventory: InventoryType;
  readonly style: StyleProp<ViewStyle>;
  readonly showBackground?: boolean;
  readonly sharkTransform?: any[];
  readonly onItemTap?: (item: ItemType, slot: string) => void;
}) {
  const translate = useRef(new Animated.Value(0)).current;
  const nakedBounce = useRef(new Animated.Value(1)).current;
  const containerSize = useRef({ width: 0, height: 0 });

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(translate, {
          toValue: 10,
          duration: 2700,
          useNativeDriver: true,
        }),
        Animated.timing(translate, {
          toValue: 0,
          duration: 2700,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Check if shark is "naked" (no wearable items)
  const isNaked = !inventory?.head_item && !inventory?.face_item &&
    !inventory?.neck_item && !inventory?.body_item && !inventory?.hand_item &&
    !inventory?.pin_item;

  const triggerNakedBounce = () => {
    Animated.sequence([
      Animated.spring(nakedBounce, {
        toValue: 1.08,
        useNativeDriver: true,
        speed: 50,
        bounciness: 4,
      }),
      Animated.spring(nakedBounce, {
        toValue: 1,
        useNativeDriver: true,
        speed: 12,
        bounciness: 16,
      }),
    ]).start();
  };

  // Single tap handler — resolves which equipped item was tapped by zone
  const handleSharkTap = useCallback((e: GestureResponderEvent) => {
    if (!onItemTap) return;

    const { locationX, locationY } = e.nativeEvent;
    const { width, height } = containerSize.current;
    if (!width || !height) return;

    const yPct = locationY / height;
    const xPct = locationX / width;

    for (const zone of SLOT_ZONES) {
      if (yPct < zone.yMin || yPct > zone.yMax) continue;
      if (zone.xMin !== undefined && (xPct < zone.xMin || xPct > zone.xMax!)) continue;

      const slotKey = zone.slot as keyof InventoryType;
      const item = inventory?.[slotKey];
      if (item && typeof item === 'object' && 'id' in item) {
        onItemTap(item as ItemType, zone.slot);
        return;
      }
    }

    if (isNaked) {
      triggerNakedBounce();
    }
  }, [onItemTap, inventory, isNaked]);

  return (
    <View style={style}>
      <View
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
        }}
      >
        {inventory?.background_item && showBackground && (
          <Image
            source={{
              uri: inventory.background_item.paper_url,
            }}
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
            }}
            contentFit="cover"
          />
        )}
        {inventory?.pin_item && (
          onItemTap ? (
            <Pressable
              onPress={() => onItemTap(inventory.pin_item, 'pin_item')}
              style={{
                position: 'absolute',
                right: 10,
                top: 80,
                width: 60,
                height: 60,
                zIndex: 20,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Image
                source={{ uri: inventory.pin_item.icon_url }}
                style={{ width: 40, height: 40 }}
                contentFit="contain"
              />
            </Pressable>
          ) : (
            <Image
              source={{ uri: inventory.pin_item.icon_url }}
              style={{
                width: 40,
                height: 40,
                position: 'absolute',
                right: 20,
                top: 90,
              }}
              contentFit="contain"
            />
          )
        )}
        <Animated.View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            transform: [
              {
                translateY: translate,
              },
              ...(sharkTransform || []),
              ...(onItemTap ? [{ scale: nakedBounce }] : []),
            ],
          }}
        >
          <View
            onLayout={(e) => {
              containerSize.current = {
                width: e.nativeEvent.layout.width,
                height: e.nativeEvent.layout.height,
              };
            }}
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              marginTop: '5%',
            }}
          >
            {/* Shark body */}
            <Image
              source={
                inventory?.skin_item?.no_eye_url
                  ? { uri: inventory.skin_item.no_eye_url }
                  : require('../../assets/images/screens/inventory/shark.png')
              }
              style={styles.image}
              contentFit="contain"
            />
            <Image
              source={require('../../assets/images/screens/inventory/blink.png')}
              style={styles.image}
              contentFit="contain"
            />
            {/* Item layers — purely visual, no individual Pressables */}
            {inventory?.body_item && (
              <Image source={{ uri: inventory.body_item.paper_url }} style={styles.image} contentFit="contain" />
            )}
            {inventory?.face_item && (
              <Image source={{ uri: inventory.face_item.paper_url }} style={styles.image} contentFit="contain" />
            )}
            {inventory?.neck_item && (
              <Image source={{ uri: inventory.neck_item.paper_url }} style={styles.image} contentFit="contain" />
            )}
            {inventory?.hand_item && (
              <Image source={{ uri: inventory.hand_item.paper_url }} style={styles.image} contentFit="contain" />
            )}
            {inventory?.head_item && (
              <Image source={{ uri: inventory.head_item.paper_url }} style={styles.image} contentFit="contain" />
            )}
            {/* Single tap overlay — uses coordinates to determine which equipped item */}
            {onItemTap && (
              <Pressable
                onPress={handleSharkTap}
                style={[StyleSheet.absoluteFill, { zIndex: 50 }]}
              />
            )}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
});
