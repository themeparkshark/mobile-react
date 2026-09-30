import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, FlatList, Pressable, StyleSheet, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { getWishlist, toggleWishlist, WishlistRide } from '../../api/endpoints/rides/wishlist';
import RideTypeIcon from '../../components/RideTracker/RideTypeIcon';
import { colors } from '../../design-system';
import { GameIcon, gameAlert, SharkLoader } from '../../ui';

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
      <GameIcon name="close" size={26} accessibilityLabel={`Remove ${ride.name}`} />
    </Pressable>
  </Pressable>
));
WishlistItem.displayName = 'WishlistItem';

export default function RideWishlistScreen() {
  const navigation = useNavigation<any>();
  const [rides, setRides] = useState<WishlistRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [failed, setFailed] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const data = await getWishlist();
      setRides(data);
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
    setRefreshing(true); await fetchData(); setRefreshing(false);
  }, [fetchData]);

  const handleRemove = useCallback(async (rideId: number) => {
    try {
      await toggleWishlist(rideId);
      setRides(prev => prev.filter(r => r.id !== rideId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      gameAlert("Couldn't remove it", 'Check your connection and try again.');
    }
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient colors={['#38BDF8', '#0EA5E9', '#09268f']} style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={12} style={styles.backButton}>
          <GameIcon name="back" size={36} accessibilityLabel="Back" />
        </Pressable>
        <Text style={styles.title}>WISHLIST</Text>
        <View style={{ width: 40 }} />
      </LinearGradient>

      {loading || (failed && !rides.length) ? (
        <SharkLoader state={loading ? 'loading' : 'error'} title={loading ? undefined : "Wishlist didn't load"} onRetry={firstLoad} />
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
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0EA5E9" />}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <GameIcon name="star" size={72} />
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
  content: { padding: 16, paddingBottom: 60 },
  item: {
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF', 
    borderRadius: 16, 
    padding: 14, 
    marginBottom: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  itemName: { color: '#1a1a2e', fontSize: 15, fontFamily: 'Knockout' },
  itemPark: { color: '#475569', fontSize: 12, fontFamily: 'Knockout', marginTop: 2 },
  removeBtn: {
    width: 28, 
    height: 28, 
    borderRadius: 14, 
    backgroundColor: 'rgba(239,68,68,0.15)',
    justifyContent: 'center', 
    alignItems: 'center',
  },
  removeBtnText: { color: '#ef4444', fontSize: 14, fontFamily: 'Knockout' },
  emptyContainer: { alignItems: 'center', paddingVertical: 60 },
  emptyEmoji: { fontSize: 60, fontFamily: 'Knockout' },
  emptyTitle: { 
    color: '#1a1a2e', 
    fontSize: 22, 
    marginTop: 16, 
    fontFamily: 'Shark' 
  },
  emptySubtitle: { 
    color: '#475569', 
    fontSize: 15, fontFamily: 'Knockout', 
    marginTop: 8, 
    textAlign: 'center' 
  },
});