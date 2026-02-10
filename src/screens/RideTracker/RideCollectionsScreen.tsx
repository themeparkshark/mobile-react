import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { getRideCollections, RideCollection } from '../../api/endpoints/rides/collections';
import RideTypeIcon from '../../components/RideTracker/RideTypeIcon';
import { colors, shadows, borderRadius } from '../../design-system';

// ─── Collection Card ───
interface CollectionCardProps {
  collection: RideCollection;
  onPress: () => void;
}

const CollectionCard: React.FC<CollectionCardProps> = React.memo(({ collection, onPress }) => {
  const progress = collection.total_items > 0
    ? (collection.completed_items / collection.total_items) * 100
    : 0;

  return (
    <Pressable
      onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }}
      style={({ pressed }) => [styles.collCard, pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] }]}
    >
      <View style={styles.collHeader}>
        <Text style={styles.collIcon}>{collection.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.collName}>{collection.name}</Text>
          {collection.description && (
            <Text style={styles.collDesc} numberOfLines={2}>{collection.description}</Text>
          )}
        </View>
        {collection.is_complete && <Text style={styles.completeBadge}>✅</Text>}
      </View>

      {/* Progress bar */}
      <View style={styles.progressRow}>
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: `${progress}%` },
            collection.is_complete && { backgroundColor: colors.success }]} />
        </View>
        <Text style={styles.progressText}>
          {collection.completed_items}/{collection.total_items}
        </Text>
      </View>

      {/* Items preview */}
      <View style={styles.itemsRow}>
        {collection.items.slice(0, 6).map(item => (
          <View key={item.id} style={[styles.itemChip, item.completed && styles.itemChipDone]}>
            <RideTypeIcon type={item.type} size={12} />
            <Text style={[styles.itemName, item.completed && styles.itemNameDone]} numberOfLines={1}>
              {item.name}
            </Text>
            {item.completed && <Text style={styles.itemCheck}>✓</Text>}
          </View>
        ))}
        {collection.items.length > 6 && (
          <Text style={styles.moreText}>+{collection.items.length - 6} more</Text>
        )}
      </View>

      {/* Rewards */}
      <View style={styles.rewardsRow}>
        <Text style={styles.rewardText}>🏅 {collection.xp_reward} XP</Text>
        <Text style={styles.rewardText}>🪙 {collection.coin_reward} coins</Text>
      </View>
    </Pressable>
  );
});
CollectionCard.displayName = 'CollectionCard';

export default function RideCollectionsScreen() {
  const navigation = useNavigation<any>();
  const [collections, setCollections] = useState<RideCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await getRideCollections();
      setCollections(data);
    } catch (e) {
      console.error('Failed to load collections:', e);
    }
  }, []);

  useEffect(() => {
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backBtn}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Collections</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
        >
          {collections.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🏆</Text>
              <Text style={styles.emptyTitle}>No collections yet!</Text>
              <Text style={styles.emptySubtitle}>Collections will appear here as they're added</Text>
            </View>
          ) : (
            collections.map(c => (
              <CollectionCard key={c.id} collection={c} onPress={() => {
                Alert.alert(
                  c.name,
                  `${c.description || 'Complete this collection to earn rewards!'}\n\nProgress: ${c.completed_items}/${c.total_items} rides`,
                );
              }} />
            ))
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bgDark },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
  },
  backBtn: { color: colors.secondary, fontSize: 16, fontWeight: '600' },
  title: { color: colors.textPrimary, fontSize: 20, fontWeight: '700', fontFamily: 'Shark' },
  content: { padding: 16, paddingBottom: 60 },
  // Collection card
  collCard: {
    backgroundColor: colors.bgMedium, borderRadius: 16, padding: 16, marginBottom: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', ...shadows.md,
  },
  collHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  collIcon: { fontSize: 36 },
  collName: { color: colors.textPrimary, fontSize: 18, fontWeight: '700', fontFamily: 'Knockout' },
  collDesc: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
  completeBadge: { fontSize: 24 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  progressBar: { flex: 1, height: 6, backgroundColor: colors.bgDark, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: colors.secondary, borderRadius: 3 },
  progressText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', width: 40 },
  itemsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  itemChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.bgDark, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
  },
  itemChipDone: { backgroundColor: 'rgba(76,175,80,0.15)', borderWidth: 1, borderColor: 'rgba(76,175,80,0.3)' },
  itemName: { color: colors.textSecondary, fontSize: 11, maxWidth: 100 },
  itemNameDone: { color: colors.success },
  itemCheck: { color: colors.success, fontSize: 12, fontWeight: '700' },
  moreText: { color: colors.textMuted, fontSize: 11, alignSelf: 'center' },
  rewardsRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  rewardText: { color: colors.textMuted, fontSize: 12 },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 60 },
  emptyTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginTop: 16, fontFamily: 'Shark' },
  emptySubtitle: { color: colors.textSecondary, fontSize: 15, marginTop: 8 },
});
