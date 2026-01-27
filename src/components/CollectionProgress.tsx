import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View, TouchableOpacity } from 'react-native';
import { colors, shadows, borderRadius, spacing, typography } from '../design-system';

interface CollectionItem {
  id: string | number;
  name: string;
  imageUrl?: string;
  icon?: string;
  collected: boolean;
  rarity?: number;
}

interface Props {
  title: string;
  items: CollectionItem[];
  columns?: number;
  showPercentage?: boolean;
  onItemPress?: (item: CollectionItem) => void;
}

/**
 * Collection progress grid showing collected vs uncollected items.
 * Uncollected items show as silhouettes (like Pokémon dex).
 */
export default function CollectionProgress({
  title,
  items,
  columns = 5,
  showPercentage = true,
  onItemPress,
}: Props) {
  const collected = items.filter((i) => i.collected).length;
  const total = items.length;
  const percentage = Math.floor((collected / total) * 100);
  
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: percentage,
      duration: 800,
      useNativeDriver: false,
    }).start();
  }, [percentage]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.statsContainer}>
          <Text style={styles.count}>{collected}/{total}</Text>
          {showPercentage && (
            <Text style={styles.percentage}>{percentage}%</Text>
          )}
        </View>
      </View>

      {/* Progress bar */}
      <View style={styles.progressBarContainer}>
        <Animated.View
          style={[
            styles.progressBarFill,
            {
              width: progressAnim.interpolate({
                inputRange: [0, 100],
                outputRange: ['0%', '100%'],
              }),
              backgroundColor: percentage === 100 ? colors.rarity.legendary.main : colors.secondary,
            },
          ]}
        />
      </View>

      {/* Collection grid */}
      <View style={[styles.grid, { flexWrap: 'wrap' }]}>
        {items.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[
              styles.itemContainer,
              { width: `${100 / columns}%` },
            ]}
            onPress={() => onItemPress?.(item)}
            disabled={!item.collected}
            activeOpacity={0.7}
          >
            <CollectionItem item={item} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Completion bonus indicator */}
      {percentage === 100 && (
        <View style={styles.completeBadge}>
          <Text style={styles.completeBadgeText}>✨ COMPLETE! ✨</Text>
        </View>
      )}
    </View>
  );
}

/**
 * Single collection item - shows either the item or a silhouette
 */
function CollectionItem({ item }: { item: CollectionItem }) {
  const scaleAnim = useRef(new Animated.Value(item.collected ? 1 : 0.9)).current;

  if (!item.collected) {
    // Silhouette for uncollected
    return (
      <View style={styles.silhouetteContainer}>
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.silhouetteImage}
            contentFit="contain"
          />
        ) : (
          <View style={styles.silhouettePlaceholder}>
            <Text style={styles.questionMark}>?</Text>
          </View>
        )}
        {/* Dark overlay */}
        <View style={styles.silhouetteOverlay} />
      </View>
    );
  }

  // Collected item with glow based on rarity
  const rarityGlow = {
    1: 'rgba(76, 175, 80, 0.3)',
    2: 'rgba(0, 165, 245, 0.3)',
    3: 'rgba(156, 39, 176, 0.4)',
    4: 'rgba(255, 107, 0, 0.5)',
    5: 'rgba(255, 215, 0, 0.6)',
  }[item.rarity || 1];

  return (
    <Animated.View
      style={[
        styles.collectedContainer,
        {
          transform: [{ scale: scaleAnim }],
          shadowColor: rarityGlow,
        },
      ]}
    >
      {item.imageUrl ? (
        <Image
          source={{ uri: item.imageUrl }}
          style={styles.itemImage}
          contentFit="contain"
        />
      ) : (
        <Text style={styles.itemIcon}>{item.icon || '🎁'}</Text>
      )}
    </Animated.View>
  );
}

/**
 * Compact version for inline use
 */
export function CollectionProgressCompact({
  collected,
  total,
  label,
}: {
  collected: number;
  total: number;
  label?: string;
}) {
  const percentage = Math.floor((collected / total) * 100);

  return (
    <View style={styles.compactContainer}>
      {label && <Text style={styles.compactLabel}>{label}</Text>}
      <View style={styles.compactProgressContainer}>
        <View style={styles.compactProgressBar}>
          <View
            style={[
              styles.compactProgressFill,
              {
                width: `${percentage}%`,
                backgroundColor: percentage === 100 ? colors.rarity.legendary.main : colors.secondary,
              },
            ]}
          />
        </View>
        <Text style={styles.compactText}>{collected}/{total}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.bgMedium,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    ...shadows.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    ...typography.styles.heading3,
  },
  statsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  count: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: colors.textPrimary,
  },
  percentage: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: colors.tertiary,
    backgroundColor: 'rgba(254, 201, 14, 0.2)',
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  progressBarContainer: {
    height: 8,
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.full,
    marginBottom: spacing.lg,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  grid: {
    flexDirection: 'row',
  },
  itemContainer: {
    padding: spacing.xs,
    aspectRatio: 1,
  },
  silhouetteContainer: {
    flex: 1,
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  silhouetteImage: {
    width: '80%',
    height: '80%',
    tintColor: '#000',
    opacity: 0.3,
  },
  silhouettePlaceholder: {
    width: '80%',
    height: '80%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionMark: {
    fontSize: 24,
    color: 'rgba(255, 255, 255, 0.2)',
    fontWeight: 'bold',
  },
  silhouetteOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  collectedContainer: {
    flex: 1,
    backgroundColor: colors.bgLight,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 8,
  },
  itemImage: {
    width: '80%',
    height: '80%',
  },
  itemIcon: {
    fontSize: 28,
  },
  completeBadge: {
    marginTop: spacing.md,
    alignItems: 'center',
    backgroundColor: colors.rarity.legendary.main,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  completeBadgeText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: colors.primary,
    fontWeight: 'bold',
  },
  // Compact styles
  compactContainer: {
    gap: spacing.xs,
  },
  compactLabel: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: colors.textSecondary,
    textTransform: 'uppercase',
  },
  compactProgressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compactProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: colors.bgDark,
    borderRadius: borderRadius.full,
    overflow: 'hidden',
  },
  compactProgressFill: {
    height: '100%',
    borderRadius: borderRadius.full,
  },
  compactText: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: colors.textSecondary,
    minWidth: 40,
    textAlign: 'right',
  },
});
