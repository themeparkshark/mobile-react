import { useCallback, useContext, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import Topbar from '../components/Topbar';
import Loading from '../components/Loading';
import { ImageBackground, ScrollView, View } from 'react-native';
import { UserType } from '../models/user-type';
import FriendsList from '../components/FriendsList';
import getFriendRequests from '../api/endpoints/me/pending-requests';
import { FriendContext } from '../context/FriendProvider';
import { useAsyncEffect } from 'rooks';

export default function PendingFriendRequestsScreen() {
  const [loading, setLoading] = useState<boolean>(true);
  const [friendRequests, setFriendRequests] = useState<UserType[]>([]);
  const { refreshFriends } = useContext(FriendContext);

  const requestFriendRequests = async () => {
    setFriendRequests(await getFriendRequests());
  };

  useEffect(() => {
    friendRequests ? setLoading(false) : setLoading(true);
  }, [friendRequests]);

  useAsyncEffect(async () => {
    await requestFriendRequests();
  }, []);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Pending Friend Requests screen.');
    }, [])
  );

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
                    <FriendsList
                      users={friendRequests}
                      onSuccess={async () => {
                        await requestFriendRequests();
                        await refreshFriends();
                      }}
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
