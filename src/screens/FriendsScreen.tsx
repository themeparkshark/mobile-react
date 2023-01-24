import { useCallback, useContext, useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import Topbar from '../components/Topbar';
import Loading from '../components/Loading';
import {
  ImageBackground,
  Image,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { UserType } from '../models/user-type';
import getFriends from '../api/endpoints/me/friends';
import FriendsList from '../components/FriendsList';
import searchUsers from '../api/endpoints/users/all';
import Button from '../components/Button';
import { AuthContext } from '../context/AuthProvider';
import * as RootNavigation from '../RootNavigation';

export default function FriendsScreen() {
  const [loading, setLoading] = useState<boolean>(true);
  const [friends, setFriends] = useState<UserType[]>([]);
  const [searchResults, setSearchResults] = useState<UserType[]>([]);
  const [search, setSearch] = useState<string>('');
  const { user } = useContext(AuthContext);

  const requestFriends = async () => {
    setFriends(await getFriends());
  };

  useEffect(() => {
    friends ? setLoading(false) : setLoading(true);
  }, [friends]);

  useEffect(() => {
    (async () => {
      await requestFriends();
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Friends screen.');
    }, [])
  );

  return (
    <>
      <Topbar text="Friends" showBackButton={true} />
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
              padding: 16,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                flexDirection: 'row',
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
                onChangeText={setSearch}
                value={search}
                maxLength={12}
                placeholder="Enter a username"
                returnKeyType="search"
                enablesReturnKeyAutomatically
                onSubmitEditing={async ({ nativeEvent }) => {
                  setLoading(true);
                  try {
                    setSearchResults(await searchUsers(nativeEvent.text));
                  } catch (error) {
                    setLoading(false);
                  }
                  setLoading(false);
                }}
              />
              <TouchableOpacity
                onPress={() => {
                  setSearch('');
                  setSearchResults([]);
                }}
                style={{
                  marginLeft: 16,
                }}
              >
                <Text>Clear</Text>
              </TouchableOpacity>
              <View
                style={{
                  marginLeft: 16,
                }}
              >
                <Button
                  onPress={() => {
                    RootNavigation.navigate('PendingFriendRequests');
                  }}
                  showRedCircle={user?.has_pending_friend_requests}
                >
                  <Image
                    source={require('../../assets/images/screens/explore/base.png')}
                    style={{
                      width: 60,
                      height: 60,
                    }}
                    resizeMode="contain"
                  />
                </Button>
              </View>
            </View>
          </View>
          <View
            style={{
              flex: 1,
            }}
          >
            <View
              style={{
                backgroundColor: 'rgba(255, 255, 255, .6)',
                borderTopWidth: 5,
                borderTopColor: '#fff',
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
                      users={searchResults.length ? searchResults : friends}
                      onUnfriend={() => requestFriends()}
                    />
                    {!friends.length && !searchResults.length && (
                      <Text
                        style={{
                          textAlign: 'center',
                          fontSize: 24,
                          fontFamily: 'Knockout',
                          paddingTop: 32,
                        }}
                      >
                        You have no friends.
                      </Text>
                    )}
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
