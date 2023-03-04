import { Image } from 'expo-image';
import { useContext, useEffect, useState } from 'react';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import { Chevron } from 'react-native-shapes';
import { useAsyncEffect } from 'rooks';
import getUsers from '../../api/endpoints/leaderboards/users';
import allParks from '../../api/endpoints/parks/allParks';
import getLeaderboards from '../../api/endpoints/parks/leaderboards/get';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import LeaderboardUser from '../../components/LeaderboardUser';
import Loading from '../../components/Loading';
import config from '../../config';
import { AuthContext } from '../../context/AuthProvider';
import { LeaderboardType } from '../../models/leaderboard-type';
import { ParkType } from '../../models/park-type';
import { UserType } from '../../models/user-type';
import * as RootNavigation from '../../RootNavigation';

export default function ParkCoins({ route }) {
  const [loading, setLoading] = useState<boolean>(true);
  const { user } = useContext(AuthContext);

  const [parks, setParks] = useState<ParkType[]>([]);
  const [selectedPark, setSelectedPark] = useState<number>();
  const [selectedLeaderboard, setSelectedLeaderboard] =
    useState<LeaderboardType>();
  const [users, setUsers] = useState<UserType[]>([]);
  const [leaderboards, setLeaderboards] = useState<LeaderboardType[]>();

  useAsyncEffect(async () => {
    setParks(await allParks());
  }, []);

  useEffect(() => {
    if (route.params?.park) {
      setSelectedPark(route.params?.park);
    } else if (user?.current_park_id) {
      setSelectedPark(user.current_park_id);
    } else if (parks.length) {
      setSelectedPark(parks[0].id);
    }
  }, [route.params?.park, parks, user]);

  useEffect(() => {
    if (leaderboards) {
      setSelectedLeaderboard(leaderboards[0]);
    }
  }, [leaderboards]);

  useAsyncEffect(async () => {
    if (selectedLeaderboard) {
      setUsers(await getUsers(selectedLeaderboard.id));
      setLoading(false);
    }
  }, [selectedLeaderboard]);

  useAsyncEffect(async () => {
    if (!selectedPark) {
      return;
    }

    setLeaderboards(await getLeaderboards(selectedPark));
  }, [selectedPark]);

  return (
    <>
      {loading && <Loading />}
      {!loading && (
        <ScrollView>
          <View
            style={{
              height: 540,
              position: 'relative',
            }}
          >
            {users.length > 0 && (
              <>
                <View
                  style={{
                    position: 'absolute',
                    zIndex: 10,
                    top: 100,
                    width: '100%',
                  }}
                >
                  {users[0] && <LeaderboardUser user={users[0]} size={1} />}
                </View>
                <View
                  style={{
                    position: 'absolute',
                    zIndex: 10,
                    top: 180,
                    left: 130,
                    width: '100%',
                  }}
                >
                  {users[1] && <LeaderboardUser user={users[1]} size={2} />}
                </View>
                <View
                  style={{
                    position: 'absolute',
                    zIndex: 10,
                    top: 220,
                    left: -130,
                    width: '100%',
                  }}
                >
                  {users[2] && <LeaderboardUser user={users[2]} size={3} />}
                </View>
              </>
            )}
            <View
              style={{
                paddingTop: 16,
                paddingLeft: 16,
                paddingRight: 16,
                flexDirection: 'row',
              }}
            >
              <View style={{ flex: 1 }}>
                {parks && (
                  <RNPickerSelect
                    placeholder={{}}
                    onValueChange={(value) => setSelectedPark(value)}
                    value={selectedPark}
                    items={parks.map((item) => {
                      return {
                        label: item.name,
                        value: item.id,
                      };
                    })}
                    style={{
                      inputIOS: {
                        paddingVertical: 12,
                        paddingHorizontal: 10,
                        borderWidth: 2,
                        borderRadius: 10,
                        paddingRight: 30,
                        backgroundColor: config.secondary,
                        borderColor: 'white',
                        color: 'white',
                        fontSize: 20,
                        textAlign: 'center',
                        fontFamily: 'Knockout',
                        textShadowColor: 'rgba(0, 0, 0, .5)',
                        textShadowRadius: 5,
                      },
                      iconContainer: {
                        top: 22,
                        right: 22,
                      },
                    }}
                    Icon={() => <Chevron size={1.5} color="white" />}
                  />
                )}
              </View>
              <View style={{ flex: 1, paddingLeft: 16 }}>
                {leaderboards && (
                  <RNPickerSelect
                    placeholder={{}}
                    onValueChange={(value) => setSelectedLeaderboard(value)}
                    value={selectedLeaderboard}
                    items={leaderboards.map((item) => {
                      return {
                        label: item.duration_text,
                        value: item.id,
                      };
                    })}
                    style={{
                      inputIOS: {
                        paddingVertical: 12,
                        paddingHorizontal: 10,
                        borderWidth: 2,
                        borderRadius: 10,
                        paddingRight: 30,
                        backgroundColor: config.secondary,
                        borderColor: 'white',
                        color: 'white',
                        fontSize: 20,
                        textAlign: 'center',
                        fontFamily: 'Knockout',
                        textShadowColor: 'rgba(0, 0, 0, .5)',
                        textShadowRadius: 5,
                      },
                      iconContainer: {
                        top: 22,
                        right: 22,
                      },
                    }}
                    Icon={() => <Chevron size={1.5} color="white" />}
                  />
                )}
              </View>
            </View>
            <Image
              style={{
                width: Dimensions.get('window').width,
                height: 270,
                position: 'absolute',
                bottom: 0,
              }}
              contentFit="cover"
              source={require('../../../assets/images/screens/leaderboard/barrel.png')}
            />
          </View>
          <View
            style={{
              backgroundColor: 'rgba(255, 255, 255, .6)',
              borderTopWidth: 5,
              borderTopColor: '#fff',
              height: '100%',
              paddingBottom: 32,
            }}
          >
            {users.slice(3).length > 0 &&
              users.slice(3).map((user, index) => {
                return (
                  <View
                    key={user.id}
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
                        {index + 4}
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
                      <Button
                        onPress={() =>
                          RootNavigation.navigate('User', {
                            user: user.id,
                          })
                        }
                      >
                        <Avatar size={50} user={user} />
                      </Button>
                      <Text
                        style={{
                          fontSize: 24,
                          fontFamily: 'Shark',
                          color: 'black',
                          textTransform: 'uppercase',
                          paddingLeft: 32,
                        }}
                      >
                        {user.screen_name}
                      </Text>
                    </View>
                    <View
                      style={{
                        paddingLeft: 16,
                        paddingRight: 16,
                        flex: 0,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 24,
                          fontFamily: 'Shark',
                          color: 'black',
                        }}
                      >
                        {user.park_coins}
                      </Text>
                    </View>
                  </View>
                );
              })}
          </View>
        </ScrollView>
      )}
    </>
  );
}
