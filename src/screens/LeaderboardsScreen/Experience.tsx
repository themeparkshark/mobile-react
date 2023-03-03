import { FlashList } from '@shopify/flash-list';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import all from '../../api/endpoints/users/all';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import { UserType } from '../../models/user-type';
import * as RootNavigation from '../../RootNavigation';

export default function Experience() {
  const [loading, setLoading] = useState<boolean>(true);
  const [users, setUsers] = useState<UserType[]>([]);
  const [page, setPage] = useState<number>(1);

  const fetchUsers = async (page: number) => {
    const response = await all(page);
    setUsers((prevState) => {
      return [...prevState, ...response];
    });
  };

  useEffect(() => {
    fetchUsers(page).then(() => setLoading(false));
  }, []);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchUsers(page);
    }
  }, [page]);

  return (
    <View style={{ flex: 1, }}>
      {loading && <Loading />}
      {!loading && (
        <View
          style={{
            flex: 1,
          }}
        >
          <FlashList
            contentContainerStyle={{ paddingBottom: 8 }}
            data={users}
            keyExtractor={(user) => user.id.toString()}
            renderItem={({ item, index }) => {
              return (
                <View
                  key={item.id}
                  style={{
                    paddingTop: 25,
                    paddingBottom: 25,
                    borderTopWidth: index === 0 ? 0 : 3,
                    borderColor: 'rgba(0, 0, 0, .4)',
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: '20%',
                      paddingLeft: 16,
                      paddingRight: 16,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 24,
                        fontFamily: 'Shark',
                        color: 'black',
                      }}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingLeft: 16,
                      paddingRight: 16,
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <View>
                      <Button
                        onPress={() =>
                          RootNavigation.navigate('User', {
                            user: item.id,
                          })
                        }
                      >
                        <Avatar size={50} user={item} />
                      </Button>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 24,
                          fontFamily: 'Shark',
                          color: 'black',
                          textTransform: 'uppercase',
                          paddingLeft: 16,
                        }}
                        numberOfLines={1}
                      >
                        {item.screen_name}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      paddingLeft: 16,
                      paddingRight: 16,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 24,
                        fontFamily: 'Shark',
                        color: 'black',
                      }}
                    >
                      {item.total_experience}
                    </Text>
                  </View>
                </View>
              );
            }}
            estimatedItemSize={100}
            onEndReached={() => {
              setPage((prevState) => prevState + 1);
            }}
          />
        </View>
      )}
    </View>
  );
}
