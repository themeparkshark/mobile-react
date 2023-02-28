import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { UserType } from '../models/user-type';
import * as RootNavigation from '../RootNavigation';
import Avatar from './Avatar';

export default function FriendsList({
  users,
}: {
  readonly users: UserType[];
  readonly onSuccess?: () => void;
}) {
  const [page, setPage] = useState<number>(1);

  return (
    <View>
      {users.length > 0 && (
        <View>
          <FlashList
            contentContainerStyle={{ paddingBottom: 8 }}
            data={users}
            keyExtractor={(user) => user.id.toString()}
            renderItem={({ item }) => (
              <TouchableOpacity
                key={item.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingTop: 16,
                }}
                onPress={() => {
                  RootNavigation.navigate('User', {
                    user: item.id,
                  });
                }}
              >
                <View>
                  <Avatar size={60} user={item} />
                </View>
                <View
                  style={{
                    paddingLeft: 32,
                    flex: 1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 18,
                    }}
                  >
                    {item.screen_name}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
            estimatedItemSize={15}
            onEndReached={() => {
              setPage((prevState) => prevState + 1);
            }}
          />
        </View>
      )}
    </View>
  );
}
