import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Share, Text, TouchableOpacity, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getFriends, { searchFriends } from '../../api/endpoints/me/friends';
import FriendPlayer from '../../components/FriendPlayer';
import Loading from '../../components/Loading';
import SearchBar from '../../components/SearchBar';
import config from '../../config';
import { AuthContext } from '../../context/AuthProvider';
import useCrumbs from '../../hooks/useCrumbs';
import { PlayerType } from '../../models/player-type';

export default function YourList() {
  const [friends, setFriends] = useState<PlayerType[]>([]);
  const [searchResults, setSearchResults] = useState<PlayerType[] | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [searching, setSearching] = useState(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [search, setSearch] = useState('');
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { player } = useContext(AuthContext);
  const { warnings } = useCrumbs();

  const fetchFriends = async (page: number) => {
    const response = await getFriends(page);
    setFriends((prevState) => {
      return [...prevState, ...response];
    });
  };

  useEffect(() => {
    fetchFriends(page).then(() => setLoading(false));
  }, []);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchFriends(page);
    }
  }, [page]);

  // Server-side search with debounce
  const handleSearch = useCallback((text: string) => {
    setSearch(text);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    
    if (!text.trim()) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const results = await searchFriends(text.trim());
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
  }, []);

  // Show search results when searching, otherwise show paginated friends list
  const filtered = searchResults !== null ? searchResults : friends;

  const handleInvite = async () => {
    try {
      await Share.share({
        message: `I'm playing Theme Park Shark — add me as a friend! My username is ${player?.screen_name ?? 'on the app'}. Download it here: https://apps.apple.com/app/theme-park-shark/id6758812566`,
        url: 'https://apps.apple.com/app/theme-park-shark/id6758812566',
      });
    } catch {}
  };

  return (
    <View style={{ paddingTop: 8, flex: 1 }}>
      {loading && <Loading />}
      {!loading && (
        <View style={{ flex: 1 }}>
          <SearchBar
            placeholder="Search your friends..."
            onChangeText={handleSearch}
            maxLength={20}
          />
          {/* Friend count */}
          {(player?.friends_count ?? 0) > 0 && (
            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 15,
                color: 'white',
                textTransform: 'uppercase',
                letterSpacing: 1,
                paddingHorizontal: 20,
                marginBottom: 8,
                textShadowColor: 'rgba(0,0,0,0.6)',
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 2,
              }}
            >
              {search
                ? `${filtered.length} of ${player?.friends_count ?? 0} Friends`
                : `${player?.friends_count ?? 0} ${(player?.friends_count ?? 0) === 1 ? 'Friend' : 'Friends'}`}
            </Text>
          )}
          {!!filtered.length && (
            <FlashList
              contentContainerStyle={{ paddingBottom: 100, paddingHorizontal: 16 }}
              data={filtered}
              onRefresh={() => {
                setRefreshing(true);
                setFriends([]);
                fetchFriends(1).then(() => setRefreshing(false));
                setPage(1);
              }}
              refreshing={refreshing}
              keyExtractor={(player) => player.id.toString()}
              renderItem={({ item }) => {
                return (
                  <FriendPlayer
                    player={item}
                    isFriend
                    onRemove={async () => {
                      setFriends([]);
                      await fetchFriends(1);
                    }}
                  />
                );
              }}
              estimatedItemSize={80}
              onEndReached={() => {
                if (!search) setPage((prevState) => prevState + 1);
              }}
            />
          )}
          {searching && (
            <View style={{ paddingTop: 32, alignItems: 'center' }}>
              <Loading />
            </View>
          )}
          {!filtered.length && !search && !searching && (
            <Text
              style={{
                textAlign: 'center',
                fontSize: 24,
                fontFamily: 'Knockout',
                color: 'white',
                textShadowColor: 'rgba(0,0,0,0.5)',
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 2,
                paddingTop: 32,
              }}
            >
              {warnings.no_friends}
            </Text>
          )}
          {!filtered.length && !!search && !searching && (
            <Text
              style={{
                textAlign: 'center',
                fontSize: 18,
                fontFamily: 'Knockout',
                color: 'white',
                textShadowColor: 'rgba(0,0,0,0.5)',
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 2,
                paddingTop: 32,
              }}
            >
              No friends matching "{search}"
            </Text>
          )}
          {/* Invite Friends Button */}
          <View
            style={{
              position: 'absolute',
              bottom: 24,
              left: 16,
              right: 16,
            }}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleInvite}
              style={{
                backgroundColor: config.secondary,
                borderRadius: 16,
                paddingVertical: 14,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.2,
                shadowRadius: 8,
                elevation: 6,
              }}
            >
              <Image
                source={require('../../../assets/images/screens/friends/add_friend.png')}
                style={{ width: 22, height: 22, marginRight: 8 }}
                contentFit="contain"
              />
              <Text
                style={{
                  fontFamily: 'Shark',
                  fontSize: 16,
                  color: 'white',
                  textTransform: 'uppercase',
                }}
              >
                Invite Friends
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
}
