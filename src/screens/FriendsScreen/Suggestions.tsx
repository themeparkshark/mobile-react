import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { useAsyncEffect, useDebounce } from 'rooks';
import getFriendSuggestions from '../../api/endpoints/me/getFriendSuggestions';
import searchPlayers from '../../api/endpoints/players/search';
import FriendPlayer from '../../components/FriendPlayer';
import Loading from '../../components/Loading';
import SearchBar from '../../components/SearchBar';
import useCrumbs from '../../hooks/useCrumbs';
import { PlayerType } from '../../models/player-type';

export default function Suggestions() {
  const [players, setPlayers] = useState<PlayerType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { labels, warnings } = useCrumbs();
  const [search, setSearch] = useState<string>('');
  const setSearchDebounced = useDebounce(setSearch, 500);
  const [searchResults, setSearchResults] = useState<PlayerType[]>([]);

  useAsyncEffect(async () => {
    if (search.length < 3) {
      setSearchResults([]);
      return;
    }

    setSearchResults(search ? await searchPlayers(search) : []);
  }, [search]);

  useAsyncEffect(async () => {
    setPlayers(await getFriendSuggestions());
    setLoading(false);
  }, []);

  return (
    <View style={{ paddingTop: 8, flex: 1 }}>
      {loading && <Loading />}
      {!loading && (
        <View style={{ flex: 1 }}>
          <SearchBar
            placeholder="Search all players..."
            onChangeText={(text) => {
              setSearchDebounced(text);
            }}
            maxLength={14}
            autoFocus
          />

          {/* Suggestions header when not searching */}
          {!search.length && players.length > 0 && (
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
              Suggested for you
            </Text>
          )}

          {!search.length && (
            <FlashList
              contentContainerStyle={{ paddingBottom: 8, paddingHorizontal: 16 }}
              data={players}
              keyExtractor={(player) => player.id.toString()}
              renderItem={({ item }) => {
                return (
                  <FriendPlayer
                    isFriend={item.is_friend}
                    isPending={item.has_friend_request_from}
                    player={item}
                  />
                );
              }}
              estimatedItemSize={80}
            />
          )}
          {!!searchResults.length && (
            <FlashList
              contentContainerStyle={{ paddingBottom: 8, paddingHorizontal: 16 }}
              data={searchResults}
              keyExtractor={(player) => player.id.toString()}
              renderItem={({ item }) => {
                return <FriendPlayer player={item} />;
              }}
              estimatedItemSize={80}
            />
          )}
          {!searchResults.length && !!search.length && search.length >= 3 && (
            <Text
              style={{
                textAlign: 'center',
                fontSize: 18,
                fontFamily: 'Knockout',
                paddingTop: 32,
                color: 'white',
                textShadowColor: 'rgba(0,0,0,0.5)',
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 2,
              }}
            >
              No players found
            </Text>
          )}
          {!!search.length && search.length < 3 && (
            <Text
              style={{
                textAlign: 'center',
                fontSize: 14,
                fontFamily: 'Knockout',
                paddingTop: 32,
                color: 'rgba(255,255,255,0.7)',
                textShadowColor: 'rgba(0,0,0,0.4)',
                textShadowOffset: { width: 1, height: 1 },
                textShadowRadius: 2,
              }}
            >
              Type at least 3 characters to search
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
