import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator, RefreshControl, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { getWishlist, toggleWishlist, WishlistRide } from '../../api/endpoints/rides/wishlist';
import RideTypeIcon from '../../components/RideTracker/RideTypeIcon';
import { colors } from '../../design-system';

// ─── Wishlist Item ───
interface WishlistItemProps {
  ride: WishlistRide;
  onRemove: (id: number) => void;
  onPress: () => void;
}

const WishlistItem: React.FC<WishlistItemProps> = React.memo(({ ride, onRemove, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [styles.item, pressed && { opacity: 0.85 }]}>
    <View style={styles.itemLeft}>
      <RideTypeIcon type={ride.type} size={20} />
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName} numberOfLines={1}>{ride.name}</Text>
        <Text style={styles.itemPark}>{ride.park_name}</Text>
      </View>
    </View>
    <Pressable
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onRemove(ride.id);
      }}
      hitSlop={10}
      style={styles.removeBtn}
    >
      <Text style={styles.removeBtnText}>✕</Text>
    </Pressable>
  </Pressable>
));
WishlistItem.displayName = 'WishlistItem';

export default function RideWishlistScreen() {
  const navigation = useNavigation<any>();
  const [rides, setRides] = useState<WishlistRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await getWishlist();
      setRides(data);
    } catch (e) {
      console.error('Failed to load wishlist:', e);
    }
  }, []);

  useEffect(() => { fetchData().finally(() => setLoading(false)); }, [fetchData]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true); await fetchData(); setRefreshing(false);
  }, [fetchData]);

  const handleRemove = useCallback(async (rideId: number) => {
    try {
      await toggleWishlist(rideId);
      setRides(prev => prev.filter(r => r.id !== rideId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      Alert.alert('Error', 'Failed to remove from wishlist');
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12}>
          <Text style={styles.backBtn}>← Back</Text>
        </Pressable>
        <Text style={styles.title}>Want to Ride 🎢</Text>
        <View style={{ width: 60 }} />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.secondary} style={{ marginTop: 60 }} />
      ) : (
        <FlatList
          data={rides}
          keyExtractor={item => item.id.toString()}
          renderItem={({ item }) => (
            <WishlistItem
              ride={item}
              onRemove={handleRemove}
              onPress={() => navigation.navigate('RideDetail', { rideId: item.id, rideName: item.name })}
            />
          )}
          contentContainerStyle={styles.content}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.secondary} />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>⭐</Text>
              <Text style={styles.emptyTitle}>Your wishlist is empty</Text>
              <Text style={styles.emptySubtitle}>
                Add rides you want to try from their detail page!
              </Text>
            </View>
          }
        />
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
  item: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: colors.bgMedium, borderRadius: 12, padding: 14, marginBottom: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  itemName: { color: colors.textPrimary, fontSize: 15, fontWeight: '600' },
  itemPark: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  removeBtn: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: 'rgba(244,67,54,0.15)',
    justifyContent: 'center', alignItems: 'center',
  },
  removeBtnText: { color: colors.error, fontSize: 14, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 60 },
  emptyTitle: { color: colors.textPrimary, fontSize: 22, fontWeight: '700', marginTop: 16, fontFamily: 'Shark' },
  emptySubtitle: { color: colors.textSecondary, fontSize: 15, marginTop: 8, textAlign: 'center' },
});
