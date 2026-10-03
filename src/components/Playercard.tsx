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
function WornLayer({ uri, slot, pop, popFrom = 1.18, drop = false }: { readonly uri: string; readonly slot: string; readonly pop: boolean; readonly popFrom?: number; readonly drop?: boolean }) {
  const scale = useRef(new Animated.Value(pop ? popFrom : 1)).current;
  // Shop buy: the new piece falls about 40pt onto the shark before it settles.
  const fall = useRef(new Animated.Value(pop && drop ? -40 : 0)).current;
  const opacity = useRef(new Animated.Value(pop ? 0 : 1)).current;

  useEffect(() => {
    if (!pop) return;
    const arrival = Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 60, useNativeDriver: true }),
      Animated.spring(scale, { toValue: 1, damping: 9, stiffness: 260, mass: 1, useNativeDriver: true }),
      Animated.spring(fall, { toValue: 0, damping: 11, stiffness: 320, mass: 1, useNativeDriver: true }),
    ]);
    arrival.start();
    return () => arrival.stop();
  }, []);

  return (
    <Animated.View pointerEvents="none" style={[styles.image, {
      opacity,
      transform: [{ translateY: fall }, { scale }],
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
  still = false,
  pinAnchor = 'card',
  popFrom,
  dropIn = false,
  shadow = false,
}: {
  readonly inventory: InventoryType;
  readonly style: StyleProp<ViewStyle>;
  readonly showBackground?: boolean;
  readonly sharkTransform?: any[];
  readonly onItemTap?: (item: ItemType, slot: string) => void;
  /** Inventory stage: layers put on after the first frame pop in at their slot. */
  readonly popLayers?: boolean;
  /** Reduce Motion: skip the idle bob. */
  readonly still?: boolean;
  /** Stages (shop try-on, reveal): 'body' pins the pin on the chest instead of the card corner. */
  readonly pinAnchor?: 'card' | 'body';
  /** How big a newly worn layer starts before settling (1.18 by default; the shop's buy drop uses 1.4). */
  readonly popFrom?: number;
  /** Newly worn layers fall onto the shark (the shop buy landing). */
  readonly dropIn?: boolean;
  /** Stages: a contact shadow under the tail that grows and darkens as the shark bobs down. */
  readonly shadow?: boolean;
}) {
  const translate = useRef(new Animated.Value(0)).current;
  // Layers present on the first frame never pop; only ones put on later do.
  const firstFrameDone = useRef(false);
  useEffect(() => { firstFrameDone.current = true; }, []);
  const pop = popLayers && firstFrameDone.current;
  const nakedBounce = useRef(new Animated.Value(1)).current;
  const containerSize = useRef({ width: 0, height: 0 });

  useEffect(() => {
    // Reduce Motion (or a still preview): no idle bob at all.
    if (still) { translate.setValue(0); return; }
    const bob = Animated.loop(
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
    );
    bob.start();
    return () => bob.stop();
  }, [still]);

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
        {inventory?.pin_item && pinAnchor === 'card' && (
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
        {shadow && (
          <Animated.View pointerEvents="none" style={[styles.shadow, {
            opacity: translate.interpolate({ inputRange: [0, 10], outputRange: [0.16, 0.3] }),
            transform: [{ scaleX: translate.interpolate({ inputRange: [0, 10], outputRange: [0.82, 1] }) }],
          }]} />
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
                  : require('../../assets/images/screens/inventory/shark-colored-v2.png')
              }
              style={styles.image}
              contentFit="contain"
            />
            {inventory?.skin_item?.no_eye_url && (
              <Image
                source={require('../../assets/images/screens/inventory/blink.png')}
                style={styles.image}
                contentFit="contain"
              />
            )}
            {/* Item layers — purely visual, no individual Pressables */}
            {(['body_item', 'face_item', 'neck_item', 'hand_item', 'head_item'] as const).map((slot) => {
              const worn = inventory?.[slot];
              return worn?.paper_url ? (
                <WornLayer key={`${slot}-${worn.id}`} slot={slot} uri={worn.paper_url} pop={pop} popFrom={popFrom} drop={dropIn} />
              ) : null;
            })}
            {/* Stage mode: the pin sits on the chest, riding the bob with the shark. */}
            {pinAnchor === 'body' && inventory?.pin_item?.icon_url ? (
              <Image key={`pin-${inventory.pin_item.id}`} source={{ uri: inventory.pin_item.icon_url }} contentFit="contain"
                pointerEvents="none" style={styles.chestPin} />
            ) : null}
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
  // Under the tail, where the shark meets the stage (art box coordinates).
  shadow: { position: 'absolute', left: '40%', width: '36%', top: '83%', height: '4.5%', borderRadius: 999, backgroundColor: '#05346e' },
  chestPin: { position: 'absolute', left: '47%', top: '52%', width: '11%', aspectRatio: 1 },
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
});
