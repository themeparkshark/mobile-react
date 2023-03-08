import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { useAsyncEffect, useDebounce } from 'rooks';
import getFriendSuggestions from '../../api/endpoints/me/getFriendSuggestions';
import searchUsers from '../../api/endpoints/users/search';
import FriendUser from '../../components/FriendUser';
import Loading from '../../components/Loading';
import useCrumbs from '../../hooks/useCrumbs';
import { UserType } from '../../models/user-type';

export default function Suggestions() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { warnings } = useCrumbs();
  const [search, setSearch] = useState<string>('');
  const setSearchDebounced = useDebounce(setSearch, 500);
  const [searchResults, setSearchResults] = useState<UserType[]>([]);

  useAsyncEffect(async () => {
    if (search.length < 3) {
      return;
    }

    setSearchResults(search ? await searchUsers(search) : []);
  }, [search]);

  useAsyncEffect(async () => {
    setUsers(await getFriendSuggestions());
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
              placeholder="Search for a user"
              returnKeyType="search"
              enablesReturnKeyAutomatically
              autoCorrect={false}
            />
          </View>
          {!search.length && (
            <FlashList
              contentContainerStyle={{ paddingBottom: 8 }}
              data={users}
              keyExtractor={(user) => user.id.toString()}
              renderItem={({ item }) => {
                return <FriendUser user={item} isSuggestion />;
              }}
              estimatedItemSize={80}
            />
          )}
          {!!searchResults.length && (
            <FlashList
              contentContainerStyle={{ paddingBottom: 8 }}
              data={searchResults}
              keyExtractor={(user) => user.id.toString()}
              renderItem={({ item }) => {
                return <FriendUser user={item} isSuggestion />;
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
