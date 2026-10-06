import { Image } from 'expo-image';
import { useContext, useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { closetBadge, closetBadgeSay, isItemWorn, isLockedWhileWorn, itemDisplayName, sharkBaseLayers, wearableBadge } from '../helpers/wardrobe';

const PEARL = {
  white: require('../../assets/shop-life/pearl-white.webp'),
  silver: require('../../assets/shop-life/pearl-silver.webp'),
  gold: require('../../assets/shop-life/pearl-gold.webp'),
} as const;
import { InventoryType } from '../models/inventory-type';
import { ItemType } from '../models/item-type';

/** Short phones get compact cards so at least 1.5 rows show (dressing-room.md 5.2). */
export const COMPACT_HEIGHT = 700;

/**
 * One Inventory card (dressing-room.md 9.2). The border shows rarity only;
 * WORN is the yellow pill plus a navy check stamp. Cards never lock: a tap
 * always reaches the screen, which decides what it means.
 */
export default function Item({ item, onToggle, inventory, highlighted = false }: {
  readonly item: ItemType;
  readonly onToggle?: (item: ItemType) => void;
  /** The look on the stage, including taps not saved yet. Defaults to the profile. */
  readonly inventory?: InventoryType;
  /** Deep-link target: a gold ring that pulses twice. */
  readonly highlighted?: boolean;
}) {
  const { player } = useContext(AuthContext);
  const reduceMotion = useReducedGameMotion();
  const { width, height } = useWindowDimensions();
  const compact = height < COMPACT_HEIGHT;
  const artSize = Math.max(compact ? 52 : 60, Math.floor(width / 3) - (compact ? 60 : 44));
  const worn = inventory ?? player?.inventory;
  const isEquipped = isItemWorn(worn, item);
  const fixedEquippedItem = isLockedWhileWorn(worn, item);
  const badge = wearableBadge(item);
  const name = itemDisplayName(item);
  const isNew = !isEquipped && item.seen === false;
  // Items come and go: a piece that retired forever, or a rare one, says so in its corner (cp-catalogs).
  const life = closetBadge(item.lifecycle);
  const isVip = !isEquipped && !isNew && (item.is_member_item || item.source === 'vip');
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!highlighted || reduceMotion) return;
    // 1.0 to 1.08 to 1.0 over 500ms, twice (progression.md 9.8).
    const beat = () => [
      Animated.timing(pulse, { toValue: 1.08, duration: 250, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 1, duration: 250, useNativeDriver: true }),
    ];
    const animation = Animated.sequence([...beat(), ...beat()]);
    animation.start();
    return () => animation.stop();
  }, [highlighted, reduceMotion]);

  return (
    <Animated.View style={[styles.container, highlighted && { transform: [{ scale: pulse }] }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={fixedEquippedItem ? `${name}, currently worn`
          : isEquipped ? `Remove ${name} from your shark${closetBadgeSay(item.lifecycle)}` : `Wear ${name} on your shark${closetBadgeSay(item.lifecycle)}`}
        accessibilityHint={badge.label ? badge.label.toLowerCase() : undefined}
        accessibilityState={{ disabled: !onToggle, selected: isEquipped }}
        disabled={!onToggle}
        style={({ pressed }) => [styles.card, compact && styles.cardCompact, { borderColor: badge.border },
          pressed && styles.cardPressed]}
        onPress={() => onToggle?.(item)}
      >
        {!!badge.inner && <View pointerEvents="none" style={[styles.innerStroke, { borderColor: badge.inner }]} />}
        {isEquipped && <View style={styles.cornerBadge}><Text style={styles.wornText}>WORN</Text></View>}
        {isNew && <View style={[styles.cornerBadge, styles.newBadge]}><Text style={styles.newText}>NEW</Text></View>}
        {life && (
          <View style={[styles.lifeBadge, life.label === 'RETIRED' && styles.retiredBadge]} accessibilityElementsHidden>
            {life.pearl && <Image source={PEARL[life.pearl]} style={styles.pearl} contentFit="contain" />}
            <Text maxFontSizeMultiplier={1.2} style={[styles.lifeText, life.label === 'RETIRED' && styles.retiredText]}>{life.label}</Text>
          </View>
        )}
        {isVip && (
          <Image source={require('../../assets/images/screens/profile/subscribed.png')}
            style={[styles.cornerIcon]} contentFit="contain" />
        )}
        <View style={[styles.artArea, { height: artSize + (compact ? 10 : 16) }]}>
          {!!badge.glow && (
            <View pointerEvents="none" style={[styles.glow, {
              width: artSize * 0.8, height: artSize * 0.8, borderRadius: artSize * 0.4,
              backgroundColor: badge.glow, shadowColor: badge.glow,
            }]} />
          )}
          {item.item_type?.id === 4 && !!item.paper_url ? (
            <View style={{ width: artSize, height: artSize }}>
              {sharkBaseLayers(worn).map((source, index) => (
                <Image key={`base-${index}`} source={source} style={StyleSheet.absoluteFill} contentFit="contain" />
              ))}
              <Image source={item.paper_url} style={StyleSheet.absoluteFill} contentFit="contain" />
            </View>
          ) : (
            <Image
              source={item.icon_url}
              style={{ width: artSize, height: artSize }}
              contentFit="contain"
            />
          )}
          {!!badge.label && (
            // Sits on the bottom edge of the art so every card in a row keeps
            // today's height (the grid budget in dressing-room.md 5).
            <View pointerEvents="none" style={styles.labelPill}>
              <Text style={[styles.label, { color: badge.labelColor }]}>{badge.label}</Text>
            </View>
          )}
        </View>
        {!!name && (
          <Text numberOfLines={2} style={[styles.name, compact && styles.nameCompact]}>
            {name}
          </Text>
        )}
        {item.is_coin_code_item && (
          <View style={styles.chest}>
            <Image
              source={require('../../assets/images/modals/brown_closed.png')}
              style={styles.chestImage}
              contentFit="contain"
            />
          </View>
        )}
        {isEquipped && (
          <View style={styles.checkStamp} accessibilityElementsHidden>
            <View style={styles.checkShort} />
            <View style={styles.checkLong} />
          </View>
        )}
      </Pressable>
      {highlighted && <View pointerEvents="none" style={styles.highlightRing} />}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 8 },
  card: { width: '100%', minHeight: 148, alignSelf: 'center', position: 'relative', borderRadius: 14,
    borderWidth: 3, borderColor: '#fff', backgroundColor: '#f1fbff', overflow: 'hidden',
    shadowColor: '#073967', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.23,
    shadowRadius: 3, elevation: 3 },
  cardCompact: { minHeight: 112 },
  cardPressed: { transform: [{ scale: 0.97 }] },
  innerStroke: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 11, borderWidth: 1, zIndex: 2 },
  cornerBadge: { zIndex: 12, position: 'absolute', top: 5, right: 5,
    borderRadius: 7, backgroundColor: '#ffd44c', borderWidth: 1, borderColor: '#fff',
    paddingHorizontal: 5, paddingVertical: 3 },
  newBadge: { backgroundColor: '#e8412c' },
  lifeBadge: { zIndex: 12, position: 'absolute', top: 5, left: 5, flexDirection: 'row', alignItems: 'center', gap: 2,
    borderRadius: 7, backgroundColor: '#ffffff', borderWidth: 1.5, borderColor: '#123e65', paddingHorizontal: 4, paddingVertical: 2 },
  retiredBadge: { backgroundColor: '#123e65', borderColor: '#ffd44c' },
  lifeText: { color: '#123e65', fontFamily: 'Knockout', fontSize: 12 },
  retiredText: { color: '#ffd44c' },
  pearl: { width: 13, height: 13 },
  wornText: { color: '#123e65', fontFamily: 'Knockout', fontSize: 11 },
  newText: { color: '#fff', fontFamily: 'Knockout', fontSize: 11 },
  cornerIcon: { zIndex: 12, position: 'absolute', top: 5, right: 5, width: 18, height: 18 },
  artArea: { width: '100%', alignItems: 'center', justifyContent: 'center' },
  glow: { position: 'absolute', opacity: 0.55, shadowOpacity: 1, shadowRadius: 12, shadowOffset: { width: 0, height: 0 } },
  name: { color: '#15395B', fontFamily: 'Knockout', fontSize: 15,
    textAlign: 'center', paddingHorizontal: 4, paddingBottom: 7, minHeight: 43 },
  nameCompact: { fontSize: 12, minHeight: 30, paddingBottom: 4 },
  labelPill: { position: 'absolute', bottom: 0, alignSelf: 'center', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 7, backgroundColor: 'rgba(241, 251, 255, 0.92)' },
  label: { fontFamily: 'Knockout', fontSize: 11, textAlign: 'center', letterSpacing: 0.5 },
  chest: { zIndex: 20, position: 'absolute', bottom: 4, left: 4 },
  chestImage: { width: 22, height: 22 },
  checkStamp: { zIndex: 12, position: 'absolute', right: 5, bottom: 5, width: 20, height: 20, borderRadius: 10,
    backgroundColor: '#123e65', borderWidth: 1, borderColor: '#fff' },
  checkShort: { position: 'absolute', left: 4, top: 9, width: 5, height: 2.5, borderRadius: 1.25,
    backgroundColor: '#fff', transform: [{ rotate: '45deg' }] },
  checkLong: { position: 'absolute', left: 6.5, top: 7.5, width: 9, height: 2.5, borderRadius: 1.25,
    backgroundColor: '#fff', transform: [{ rotate: '-50deg' }] },
  highlightRing: { position: 'absolute', top: 5, left: 5, right: 5, bottom: 5, borderRadius: 16,
    borderWidth: 3, borderColor: '#ffcf3b' },
});
