import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import RNPickerSelect from 'react-native-picker-select';
import allParks from '../api/endpoints/parks/allParks';
import getLeaderboards from '../api/endpoints/parks/leaderboards/get';
import { useCallback, useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthProvider';
import {
  Dimensions,
  ScrollView,
  Text,
  View,
  ImageBackground,
  Image,
  Pressable,
} from 'react-native';
import { Chevron } from 'react-native-shapes';
import { ParkType } from '../models/park-type';
import { LeaderboardType } from '../models/leaderboard-type';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import config from '../config/theme';
import { UserType } from '../models/user-type';
import getUsers from '../api/endpoints/leaderboards/users';
import Loading from '../components/Loading';
import LeaderboardUser from '../components/LeaderboardUser';
import LeaderboardAvatar from '../components/LeaderboardAvatar';

export default function LeaderboardScreen({ route }) {
  const [loading, setLoading] = useState<boolean>(true);
  const { user } = useContext(AuthContext);
  const [parks, setParks] = useState<ParkType[]>();
  const [selectedPark, setSelectedPark] = useState<number>(
    route.params?.park ?? user?.current_park_id
  );
  const [selectedLeaderboard, setSelectedLeaderboard] =
    useState<LeaderboardType>();
  const [time, setTime] = useState<number>();
  const [users, setUsers] = useState<UserType[]>([]);
  const [leaderboards, setLeaderboards] = useState<LeaderboardType[]>();

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Leaderboard screen.');
    }, [])
  );

  const requestLeaderboards = async () => {
    setLeaderboards(await getLeaderboards(selectedPark));
  };

  useEffect(() => {
    (async () => {
      setParks(await allParks());
      await requestLeaderboards();
    })();
  }, []);

  useEffect(() => {
    if (leaderboards) {
      setSelectedLeaderboard(leaderboards[0]);
    }
  }, [leaderboards]);

  useEffect(() => {
    (async () => {
      if (selectedLeaderboard) {
        setUsers(await getUsers(selectedLeaderboard.id));
        setLoading(false);
      }
    })();
  }, [selectedLeaderboard]);

  useEffect(() => {
    requestLeaderboards();
  }, [time, selectedPark]);

  return (
    <Wrapper>
      <Topbar text="Leaderboards" />
      {loading && <Loading />}
      {!loading && (
        <View
          style={{
            height: Dimensions.get('window').height - 188,
            marginTop: -8,
          }}
        >
          <ImageBackground
            style={{
              flex: 1,
            }}
            source={require('../../assets/images/seaweed_background.png')}
          >
            <ScrollView>
              <View
                style={{
                  width: Dimensions.get('window').width,
                  height: 600,
                  position: 'relative',
                }}
              >
                {users.length && (
                  <>
                    <View
                      style={{
                        position: 'absolute',
                        zIndex: 10,
                        top: 160,
                        width: '100%',
                      }}
                    >
                      {users[0] && <LeaderboardUser user={users[0]} size={1} />}
                    </View>
                    <View
                      style={{
                        position: 'absolute',
                        zIndex: 10,
                        top: 240,
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
                        top: 280,
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
                  }}
                >
                  {parks && (
                    <RNPickerSelect
                      placeholder={{}}
                      onValueChange={(value) => setSelectedPark(value)}
                      onClose={() => setTime(Date.now())}
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
                          borderWidth: 3,
                          borderRadius: 10,
                          paddingRight: 30,
                          backgroundColor: config.secondary,
                          borderColor: 'white',
                          color: 'white',
                          fontSize: 20,
                          textAlign: 'center',
                          fontFamily: 'Knockout',
                          textShadowColor: config.primary,
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
                  {leaderboards && (
                    <View
                      style={{
                        flexDirection: 'row',
                        justifyContent: 'center',
                      }}
                    >
                      {leaderboards.map((leaderboard, index) => {
                        return (
                          <View
                            key={leaderboard.id}
                            style={{
                              paddingTop: 12,
                              paddingLeft: index === 0 ? 0 : 8,
                            }}
                          >
                            <Pressable
                              onPress={() =>
                                setSelectedLeaderboard(leaderboard)
                              }
                              style={{
                                backgroundColor:
                                  selectedLeaderboard?.id === leaderboard.id
                                    ? config.primary
                                    : 'white',
                                borderColor:
                                  selectedLeaderboard?.id === leaderboard.id
                                    ? 'white'
                                    : config.primary,
                                borderWidth: 3,
                                padding: 12,
                                borderRadius: 10,
                              }}
                            >
                              <Text
                                style={{
                                  textAlign: 'center',
                                  color:
                                    selectedLeaderboard?.id === leaderboard.id
                                      ? 'white'
                                      : config.primary,
                                  fontFamily: 'Knockout',
                                  fontSize: 20,
                                }}
                              >
                                {leaderboard.duration_text}
                              </Text>
                            </Pressable>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
                <Image
                  style={{
                    width: Dimensions.get('window').width,
                    height: 270,
                    position: 'absolute',
                    bottom: 0,
                  }}
                  resizeMode={'cover'}
                  source={require('../../assets/images/screens/leaderboard/barrel.png')}
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
                {users.length &&
                  users.map((user, index) => {
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
                          <LeaderboardAvatar size={50} user={user} />
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
          </ImageBackground>
        </View>
      )}
    </Wrapper>
  );
}
