import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useAsyncEffect, useDebounce } from 'rooks';
import getFriendSuggestions from '../../api/endpoints/me/getFriendSuggestions';
import searchPlayers from '../../api/endpoints/players/search';
import FriendPlayer from '../../components/FriendPlayer';
import Loading from '../../components/Loading';
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
      return;
    }

    setSearchResults(search ? await searchPlayers(search) : []);
  }, [search]);

  useAsyncEffect(async () => {
    setPlayers(await getFriendSuggestions());
    setLoading(false);
  }, []);

  return (
    <View style={{ padding: 16, flex: 1 }}>
      {loading && <Loading />}
      {!loading && (
        <View
          style={{
            flex: 1,
          }}
        >
          <View
            style={{
              width: '100%',
              alignItems: 'center',
            }}
          >
            <TextInput
              style={{
                borderWidth: 1,
                paddingTop: 15,
                paddingBottom: 15,
                paddingLeft: 25,
                paddingRight: 25,
                borderRadius: 10,
                backgroundColor: 'white',
                fontSize: 20,
                fontFamily: 'Knockout',
                width: '55%',
                textAlign: 'center',
              }}
              autoCapitalize="none"
              onChangeText={(text) => {
                setLoading(true);
                setSearchDebounced(text);
                setLoading(false);
              }}
              maxLength={14}
              placeholder={labels.search_for_a_player}
              returnKeyType="search"
              enablesReturnKeyAutomatically
              autoCorrect={false}
            />
          </View>
          {!search.length && (
            <FlashList
              contentContainerStyle={{ paddingBottom: 8 }}
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
              contentContainerStyle={{ paddingBottom: 8 }}
              data={searchResults}
              keyExtractor={(player) => player.id.toString()}
              renderItem={({ item }) => {
                return <FriendPlayer player={item} />;
              }}
              estimatedItemSize={80}
            />
          )}
          {!searchResults.length && !!search.length && (
            <Text
              style={{
                textAlign: 'center',
                fontSize: 24,
                fontFamily: 'Knockout',
                paddingTop: 16,
              }}
            >
              {warnings.no_friend_suggestions}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}
