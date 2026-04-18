import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
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
            collection.is_complete && { backgroundColor: '#22c55e' }]} />
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
      <LinearGradient colors={['#38BDF8', '#0EA5E9', '#09268f']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
          <Text style={styles.backChevron}>‹</Text>
        </Pressable>
        <Text style={styles.title}>COLLECTIONS</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {loading ? (
        <ActivityIndicator size="large" color="#0EA5E9" style={{ marginTop: 60 }} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0EA5E9" />}
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
  container: { flex: 1, backgroundColor: '#e8f4fd' },
  header: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    paddingHorizontal: 16, 
    paddingVertical: 16,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backChevron: { 
    color: '#FFFFFF', 
    fontSize: 24, 
    fontWeight: '600',
    marginLeft: -2,
  },
  title: { 
    color: '#FFFFFF', 
    fontSize: 20, 
    fontWeight: '700', 
    fontFamily: 'Shark',
    letterSpacing: 2,
  },
  content: { padding: 16, paddingBottom: 60 },
  // Collection card
  collCard: {
    backgroundColor: '#FFFFFF', 
    borderRadius: 20, 
    padding: 16, 
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  collHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  collIcon: { fontSize: 36 },
  collName: { 
    color: '#1a1a2e', 
    fontSize: 18, 
    fontWeight: '700', 
    fontFamily: 'Knockout' 
  },
  collDesc: { color: '#475569', fontSize: 13, marginTop: 2 },
  completeBadge: { fontSize: 24 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  progressBar: { 
    flex: 1, 
    height: 6, 
    backgroundColor: '#e8f4fd', 
    borderRadius: 3, 
    overflow: 'hidden' 
  },
  progressFill: { 
    height: '100%', 
    backgroundColor: '#0EA5E9', 
    borderRadius: 3 
  },
  progressText: { color: '#475569', fontSize: 13, fontWeight: '700', width: 40 },
  itemsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  itemChip: {
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 4,
    backgroundColor: '#e8f4fd', 
    borderRadius: 8, 
    paddingHorizontal: 8, 
    paddingVertical: 5,
  },
  itemChipDone: { 
    backgroundColor: 'rgba(34,197,94,0.15)', 
    borderWidth: 1, 
    borderColor: 'rgba(34,197,94,0.3)' 
  },
  itemName: { color: '#475569', fontSize: 11, maxWidth: 100 },
  itemNameDone: { color: '#22c55e' },
  itemCheck: { color: '#22c55e', fontSize: 12, fontWeight: '700' },
  moreText: { color: '#94a3b8', fontSize: 11, alignSelf: 'center' },
  rewardsRow: { flexDirection: 'row', gap: 16, marginTop: 4 },
  rewardText: { color: '#94a3b8', fontSize: 12 },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 60 },
  emptyTitle: { 
    color: '#1a1a2e', 
    fontSize: 22, 
    fontWeight: '700', 
    marginTop: 16, 
    fontFamily: 'Shark' 
  },
  emptySubtitle: { color: '#475569', fontSize: 15, marginTop: 8 },
});