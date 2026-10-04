import { Image } from 'expo-image';
import { useCallback, useEffect, useRef } from 'react';
import { Animated, GestureResponderEvent, Pressable, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { InventoryType } from '../models/inventory-type';
import { ItemType } from '../models/item-type';
import { sharkBaseLayers, slotAtPoint } from '../helpers/wardrobe';

/**
 * Where each worn layer lands, normalized on the 1353x1530 paper art
 * (dressing-room.md 7.2 slot anchors). A newly worn layer pops in from here.
 */
const SLOT_ANCHORS: Record<string, string> = {
  head_item: '62% 14%',
  face_item: '39% 26%',
  neck_item: '54% 50%',
  body_item: '52% 58%',
  hand_item: '19% 54%',
};

/**
 * One worn layer. When it arrives after the shark is already on screen it
 * fades in over 60ms and settles from 1.18 to 1.0 at its slot.
 */
function WornLayer({ uri, slot, pop }: { readonly uri: string; readonly slot: string; readonly pop: boolean }) {
  const scale = useRef(new Animated.Value(pop ? 1.18 : 1)).current;
  const opacity = useRef(new Animated.Value(pop ? 0 : 1)).current;

  useEffect(() => {
    if (!pop) return;
    const arrival = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 9, stiffness: 260, mass: 1, useNativeDriver: true }),
    ]);
    arrival.start();
    return () => arrival.stop();
  }, []);

  return (
    <Animated.View pointerEvents="none" style={[styles.image, {
      opacity,
      transform: [{ scale }],
      transformOrigin: SLOT_ANCHORS[slot] ?? 'center',
    }]}>
      <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="contain" />
    </Animated.View>
  );
}

export default function Playercard({
  inventory,
  style,
  showBackground = true,
  sharkTransform,
  onItemTap,
  popLayers = false,
}: {
  readonly inventory: InventoryType;
  readonly style: StyleProp<ViewStyle>;
  readonly showBackground?: boolean;
  readonly sharkTransform?: any[];
  readonly onItemTap?: (item: ItemType, slot: string) => void;
  /** Inventory stage: layers put on after the first frame pop in at their slot. */
  readonly popLayers?: boolean;
}) {
  const translate = useRef(new Animated.Value(0)).current;
  // Layers present on the first frame never pop; only ones put on later do.
  const firstFrameDone = useRef(false);
  useEffect(() => { firstFrameDone.current = true; }, []);
  const pop = popLayers && firstFrameDone.current;
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

    const slot = slotAtPoint(xPct, yPct, inventory);
    if (slot) {
      onItemTap(inventory![slot] as ItemType, slot);
      return;
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
            {/* Shark body (worn skin or Alex's Classic) and eyes */}
            {sharkBaseLayers(inventory).map((source, index) => (
              <Image key={`base-${index}`} source={source} style={styles.image} contentFit="contain" />
            ))}
            {/* Item layers — purely visual, no individual Pressables */}
            {(['body_item', 'face_item', 'neck_item', 'hand_item', 'head_item'] as const).map((slot) => {
              const worn = inventory?.[slot];
              return worn?.paper_url ? (
                <WornLayer key={`${slot}-${worn.id}`} slot={slot} uri={worn.paper_url} pop={pop} />
              ) : null;
            })}
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
