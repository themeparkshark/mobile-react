import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, ScrollView, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import RideTrackerFrame from './RideTrackerFrame';
import { FOOTER_CLEARANCE } from '../../components/Wrapper';
import * as Haptics from 'expo-haptics';
import { getRideCollections, RideCollection } from '../../api/endpoints/rides/collections';
import RideTypeIcon from '../../components/RideTracker/RideTypeIcon';
import { colors, shadows, borderRadius } from '../../design-system';
import { GameIcon, gameAlert, SharkLoader } from '../../ui';
import { serverIcon } from '../../components/RideTracker/rideIcons';

import RideTrackerEmpty from './RideTrackerEmpty';
import { useNavigation } from '@react-navigation/native';
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
        <GameIcon name={serverIcon(collection.icon, 'trophy')} size={40} />
        <View style={{ flex: 1 }}>
          <Text style={styles.collName}>{collection.name}</Text>
          {collection.description && (
            <Text style={styles.collDesc} numberOfLines={2}>{collection.description}</Text>
          )}
        </View>
        {collection.is_complete && <GameIcon name="check" size={30} accessibilityLabel="Complete" />}
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
            {item.completed && <GameIcon name="check" size={14} />}
          </View>
        ))}
        {collection.items.length > 6 && (
          <Text style={styles.moreText}>+{collection.items.length - 6} more</Text>
        )}
      </View>

      {/* No coin or XP line: the server does not pay collection rewards yet, so the card never promises them. */}
    </Pressable>
  );
});
CollectionCard.displayName = 'CollectionCard';

export default function RideCollectionsScreen() {
  const navigation = useNavigation<any>();
  const [collections, setCollections] = useState<RideCollection[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await getRideCollections();
      setCollections(data);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

  const firstLoad = useCallback(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  useEffect(firstLoad, [firstLoad]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
  }, [fetchData]);

  return (
    <RideTrackerFrame title="Collections" style={styles.container}>

      {loading || (failed && !collections.length) ? (
        <SharkLoader state={loading ? 'loading' : 'error'} title={loading ? undefined : "Collections didn't load"} onRetry={firstLoad} />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0EA5E9" />}
        >
          {collections.length === 0 ? (
            <RideTrackerEmpty title="No collections yet!" body="Ride sets show up here. Log rides to start filling them."
              action={{ label: 'Log a ride', icon: 'ride', onPress: () => navigation.navigate('RideLog') }} />
          ) : (
            collections.map(c => (
              <CollectionCard key={c.id} collection={c} onPress={() => {
                gameAlert(
                  c.name,
                  `${c.description || 'Ride every ride in this set to finish it!'}\n\nProgress: ${c.completed_items}/${c.total_items} rides`,
                  undefined, { icon: serverIcon(c.icon, 'trophy') },
                );
              }} />
            ))
          )}
        </ScrollView>
      )}
    </RideTrackerFrame>
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  backChevron: { 
    color: '#FFFFFF', 
    fontSize: 24, fontFamily: 'Knockout',
    marginLeft: -2,
  },
  title: { 
    color: '#FFFFFF', 
    fontSize: 20, 
    fontFamily: 'Shark',
    letterSpacing: 2,
  },
  content: { padding: 16, paddingBottom: FOOTER_CLEARANCE },
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
  collIcon: { fontSize: 36, fontFamily: 'Knockout' },
  collName: { 
    color: '#1a1a2e', 
    fontSize: 18, 
    fontFamily: 'Knockout' 
  },
  collDesc: { color: '#475569', fontSize: 13, fontFamily: 'Knockout', marginTop: 2 },
  completeBadge: { fontSize: 24, fontFamily: 'Knockout' },
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
  progressText: { color: '#475569', fontSize: 13, fontFamily: 'Knockout', width: 40 },
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
  itemName: { color: '#475569', fontSize: 11, fontFamily: 'Knockout', maxWidth: 100 },
  itemNameDone: { color: '#22c55e' },
  itemCheck: { color: '#22c55e', fontSize: 12, fontFamily: 'Knockout' },
  moreText: { color: '#94a3b8', fontSize: 11, fontFamily: 'Knockout', alignSelf: 'center' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 60, fontFamily: 'Knockout' },
  emptyTitle: { 
    color: '#1a1a2e', 
    fontSize: 22, 
    marginTop: 16, 
    fontFamily: 'Shark' 
  },
  emptySubtitle: { color: '#475569', fontSize: 15, fontFamily: 'Knockout', marginTop: 8 },
});