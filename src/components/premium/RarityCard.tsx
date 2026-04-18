/**
 * RarityCard — Store/inventory item card with rarity-based glow, holographic shimmer, and glass styling.
 * Drop-in upgrade for StoreScreen/Item.tsx and inventory grids.
 *
 * Features:
 * - Rarity-colored animated border glow
 * - Holographic shimmer sweep on Epic+ items
 * - Glass background with gradient
 * - Press-in depth animation
 * - "NEW" / "SALE" / "PIN" corner badges
 */
import { Image } from 'expo-image';
import { ReactNode, useRef } from 'react';
import {
  Animated,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { getRarityConfig, colors } from '../../design-system';
import ShimmerEffect from './ShimmerEffect';

interface Props {
  /** Item image URL */
  imageUrl: string;
  /** Rarity level 1-5 */
  rarity?: number;
  /** Cost display */
  cost?: number;
  /** Currency icon URL */
  currencyIcon?: string;
  /** Corner badge: "NEW" | "SALE" | "PIN" | custom string */
  badge?: string;
  /** Badge color override */
  badgeColor?: string;
  /** On tap handler */
  onPress?: () => void;
  /** Render item on a body preview background */
  isBodyItem?: boolean;
  /** Body preview background source */
  bodyBg?: any;
  style?: ViewStyle;
  children?: ReactNode;
}

export default function RarityCard({
  imageUrl,
  rarity = 1,
  cost,
  currencyIcon,
  badge,
  badgeColor,
  onPress,
  isBodyItem = false,
  bodyBg,
  style,
  children,
}: Props) {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rc = getRarityConfig(rarity);
  const isShiny = rarity >= 4; // Epic + Legendary get shimmer

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.94,
      friction: 6,
      tension: 300,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 200,
      useNativeDriver: true,
    }).start();
  };

  const card = (
    <Animated.View
      style={[
        styles.card,
        {
          transform: [{ scale: scaleAnim }],
          borderColor: `${rc.color}60`,
          shadowColor: rc.color,
          shadowOpacity: rarity >= 3 ? 0.5 : 0.2,
          shadowRadius: rarity >= 3 ? 12 : 4,
        },
        style,
      ]}
    >
      {/* Background gradient */}
      <LinearGradient
        colors={[
          `${rc.color}15`,
          'rgba(10,22,40,0.6)',
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Top shine */}
      <LinearGradient
        colors={['rgba(255,255,255,0.15)', 'rgba(255,255,255,0)']}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.35 }}
        style={[StyleSheet.absoluteFill, { borderTopLeftRadius: 16, borderTopRightRadius: 16 }]}
      />

      {/* Badge */}
      {badge && (
        <View
          style={[
            styles.badge,
            {
              backgroundColor: badgeColor || '#ef4444',
              shadowColor: badgeColor || '#ef4444',
            },
          ]}
        >
          <Text style={styles.badgeText}>{badge}</Text>
        </View>
      )}

      {/* Image area */}
      <View style={styles.imageContainer}>
        {isBodyItem && bodyBg ? (
          <Image source={bodyBg} style={StyleSheet.absoluteFill} contentFit="contain">
            <Image source={{ uri: imageUrl }} style={styles.image} contentFit="cover" />
          </Image>
        ) : (
          <Image source={{ uri: imageUrl }} style={styles.image} contentFit="contain" />
        )}
      </View>

      {/* Price row */}
      {cost !== undefined && (
        <View style={styles.priceRow}>
          <LinearGradient
            colors={['rgba(0,0,0,0.5)', 'rgba(0,0,0,0.7)']}
            style={StyleSheet.absoluteFill}
          />
          {currencyIcon && (
            <Image
              source={{ uri: currencyIcon }}
              style={styles.currencyIcon}
              contentFit="contain"
            />
          )}
          <Text style={styles.priceText}>{cost.toLocaleString()}</Text>
        </View>
      )}

      {/* Rarity indicator dots */}
      <View style={styles.rarityDots}>
        {Array.from({ length: 5 }).map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              {
                backgroundColor: i < rarity ? rc.color : 'rgba(255,255,255,0.15)',
                shadowColor: i < rarity ? rc.color : 'transparent',
                shadowOpacity: i < rarity ? 0.6 : 0,
                shadowRadius: 3,
              },
            ]}
          />
        ))}
      </View>

      {children}
    </Animated.View>
  );

  const wrapped = isShiny ? (
    <ShimmerEffect
      width={80}
      duration={3000}
      pauseMs={5000}
      color={`${rc.color}30`}
    >
      {card}
    </ShimmerEffect>
  ) : (
    card
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
        {wrapped}
      </Pressable>
    );
  }

  return wrapped;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: 'rgba(20,32,64,0.5)',
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  badge: {
    position: 'absolute',
    top: -2,
    left: -2,
    zIndex: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    transform: [{ rotate: '-12deg' }],
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 4,
  },
  badgeText: {
    color: 'white',
    fontFamily: 'Shark',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  imageContainer: {
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    aspectRatio: 1,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    overflow: 'hidden',
    gap: 4,
  },
  currencyIcon: {
    width: 18,
    height: 18,
  },
  priceText: {
    fontFamily: 'Shark',
    fontSize: 15,
    color: '#fec90e',
    textShadowColor: 'rgba(0,0,0,0.5)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  rarityDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 4,
    paddingBottom: 8,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
});
