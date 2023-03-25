import { useContext, useEffect, useState } from 'react';
import { ImageBackground, ScrollView, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getFriendRequests from '../api/endpoints/me/pending-requests';
import FriendsList from '../components/FriendsList';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import { UserType } from '../models/user-type';
import FriendUser from '../components/FriendUser';
import {FlashList} from '@shopify/flash-list';

export default function PendingFriendRequestsScreen() {
  const [loading, setLoading] = useState<boolean>(true);
  const [friendRequests, setFriendRequests] = useState<UserType[]>([]);

  const requestFriendRequests = async () => {
    setFriendRequests(await getFriendRequests());
  };

  useEffect(() => {
    friendRequests ? setLoading(false) : setLoading(true);
  }, [friendRequests]);

  useAsyncEffect(async () => {
    await requestFriendRequests();
  }, []);

  return (
    <>
      <Topbar text="Pending Friend Requests" showBackButton={true} />
      <View
        style={{
          marginTop: -8,
          flex: 1,
        }}
      >
        <ImageBackground
          style={{
            flex: 1,
          }}
          source={require('../../assets/images/seaweed_background.png')}
        >
          <View
            style={{
              flex: 1,
            }}
          >
            <View
              style={{
                backgroundColor: 'rgba(255, 255, 255, .6)',
                flex: 1,
              }}
            >
              {loading && <Loading />}
              {!loading && (
                <ScrollView>
                  <View
                    style={{
                      paddingLeft: 16,
                      paddingRight: 16,
                      paddingBottom: 32,
                    }}
                  >
                    <FlashList
                      contentContainerStyle={{ paddingBottom: 8 }}
                      data={friendRequests}
                      keyExtractor={(user) => user.id.toString()}
                      renderItem={({ item }) => (
                        <FriendUser isPending user={item} />
                      )}
                      estimatedItemSize={80}
                    />
                  </View>
                </ScrollView>
              )}
            </View>
          </View>
        </ImageBackground>
      </View>
    </>
  );
}
