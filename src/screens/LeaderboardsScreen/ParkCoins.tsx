import { Image } from 'expo-image';
import { useContext, useEffect, useState } from 'react';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import RNPickerSelect from 'react-native-picker-select';
import { Chevron } from 'react-native-shapes';
import { useAsyncEffect } from 'rooks';
import * as RootNavigation from '../../RootNavigation';
import getPlayers from '../../api/endpoints/leaderboards/players';
import allParks from '../../api/endpoints/parks/allParks';
import getLeaderboards from '../../api/endpoints/parks/leaderboards/get';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import LeaderboardPlayer from '../../components/LeaderboardPlayer';
import Loading from '../../components/Loading';
import config from '../../config';
import { AuthContext } from '../../context/AuthProvider';
import { LeaderboardType } from '../../models/leaderboard-type';
import { ParkType } from '../../models/park-type';
import { PlayerType } from '../../models/player-type';

export default function ParkCoins() {
  const [loading, setLoading] = useState<boolean>(true);
  const { player } = useContext(AuthContext);
  const [parks, setParks] = useState<ParkType[]>([]);
  const [selectedPark, setSelectedPark] = useState<number>();
  const [selectedLeaderboard, setSelectedLeaderboard] = useState<number>();
  const [players, setPlayers] = useState<PlayerType[]>([]);
  const [leaderboards, setLeaderboards] = useState<LeaderboardType[]>([]);

  useAsyncEffect(async () => {
    setParks(await allParks());
  }, []);

  useEffect(() => {
    if (player?.current_park_id) {
      setSelectedPark(player.current_park_id);
    } else if (parks.length) {
      setSelectedPark(parks[0].id);
    }
  }, [parks, player]);

  useEffect(() => {
    if (leaderboards.length) {
      setSelectedLeaderboard(leaderboards[0].id);
    }
  }, [leaderboards]);

  useAsyncEffect(async () => {
    if (selectedLeaderboard) {
      setPlayers(await getPlayers(selectedLeaderboard));
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
            {players.length > 0 && (
              <>
                <View
                  style={{
                    position: 'absolute',
                    zIndex: 10,
                    top: 100,
                    width: '100%',
                  }}
                >
                  {players[0] && <LeaderboardPlayer player={players[0]} />}
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
                  {players[1] && <LeaderboardPlayer player={players[1]} />}
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
                  {players[2] && <LeaderboardPlayer player={players[2]} />}
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
                {!!parks && (
                  <RNPickerSelect
                    placeholder={{}}
                    onValueChange={(value) => setSelectedPark(value)}
                    value={selectedPark}
                    items={parks.map((park) => {
                      return {
                        label: park.display_name ?? park.name,
                        value: park.id,
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
            {players.slice(3).length > 0 &&
              players.slice(3).map((player, index) => {
                return (
                  <View
                    key={player.id}
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
                        onPress={() => {
                          RootNavigation.navigate('Player', {
                            player: player.id,
                          });
                        }}
                      >
                        <Avatar player={player} />
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
                        {player.screen_name}
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
                        {player.park_coins}
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
