import { FlashList } from '@shopify/flash-list';
import { useContext, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getFriends from '../../api/endpoints/me/friends';
import FriendUser from '../../components/FriendUser';
import Loading from '../../components/Loading';
import { FriendContext } from '../../context/FriendProvider';
import useCrumbs from '../../hooks/useCrumbs';
import { UserType } from '../../models/user-type';

export default function YourList() {
  const [friends, setFriends] = useState<UserType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const { warnings } = useCrumbs();
  const { refreshFriends } = useContext(FriendContext);

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

  return (
    <View>
      {loading && <Loading />}
      {!loading && (
        <>
          <FlashList
            contentContainerStyle={{ paddingBottom: 8 }}
            data={friends}
            onRefresh={() => {
              setRefreshing(true);
              setFriends([]);
              fetchFriends(1).then(() => setRefreshing(false));
              setPage(1);
            }}
            refreshing={refreshing}
            keyExtractor={(user) => user.id.toString()}
            renderItem={({ item }) => {
              return (
                <FriendUser
                  user={item}
                  onRemove={async () => {
                    setFriends([]);
                    await fetchFriends(1);
                    await refreshFriends();
                  }}
                />
              );
            }}
            estimatedItemSize={15}
            onEndReached={() => {
              setPage((prevState) => prevState + 1);
            }}
          />
          {!friends.length && (
            <Text
              style={{
                textAlign: 'center',
                fontSize: 24,
                fontFamily: 'Knockout',
              }}
            >
              {warnings.no_friends}
            </Text>
          )}
        </>
      )}
    </View>
  );
}
