import { useCallback, useContext, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import getParks from '../api/endpoints/me/visited-parks';
import getStores from '../api/endpoints/stores/stores';
import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import Progress from '../components/Progress';
import Playercard from '../components/Playercard';
import Button from '../components/Button';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';
import getInventory from '../api/endpoints/me/inventory';
import config from '../config';
import { ParkType } from '../models/park-type';
import { StoreType } from '../models/store-type';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import { MusicContext } from '../context/MusicProvider';
import Loading from '../components/Loading';

interface ButtonType {
  readonly image: any;
  readonly screen: () => void;
  readonly text: string;
}

export default function NewsScreen({ navigation }) {
  const [parks, setParks] = useState<ParkType[]>();
  const [stores, setStores] = useState<StoreType[]>();
  const [buttons, setButtons] = useState<ButtonType[]>();
  const [loading, setLoading] = useState<boolean>(true);
  const { user, inventory, setInventory } = useContext(AuthContext);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Profile screen.');
    }, [])
  );

  useEffect(() => {
    (async () => {
      setParks(await getParks());
      setStores(await getStores());
      setInventory(await getInventory());

      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (stores) {
      setButtons([
        {
          image: require('../../assets/images/screens/profile/pin_collections.png'),
          screen: () => {
            RootNavigation.navigate('PinCollections');
          },
          text: 'Pins',
        },
        ...stores.map((store) => {
          return {
            image: store.icon_url,
            screen: () => {
              RootNavigation.navigate('Store', {
                store: store.id,
              });
            },
            text: store.name,
          };
        }),
      ]);
    }
  }, [stores]);

  return (
    user && (
      <Wrapper>
        <Topbar
          text={user.screen_name}
          button={
            <Button
              onPress={() => {
                RootNavigation.navigate('Settings');
              }}
            >
              <Image
                style={{
                  width: 50,
                  height: 50,
                  resizeMode: 'contain',
                  alignSelf: 'center',
                }}
                source={require('../../assets/images/screens/profile/settings.png')}
              />
            </Button>
          }
        />
        {loading && <Loading />}
        {!loading && (
          <ScrollView
            style={{
              flex: 1,
              marginTop: -8,
            }}
          >
            <Pressable
              style={{
                height: 315,
                overflow: 'hidden',
                position: 'relative',
              }}
              onPress={() => navigation.navigate('Inventory')}
            >
              {inventory && (
                <Playercard
                  user={user}
                  inventory={inventory}
                  style={{
                    position: 'absolute',
                    width: Dimensions.get('window').width,
                    height: 455,
                    marginTop: -55,
                  }}
                />
              )}
            </Pressable>
            <View
              style={{
                borderTopWidth: 5,
                borderTopColor: config.primary,
                paddingLeft: 32,
                paddingRight: 32,
                paddingTop: 24,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  fontSize: 32,
                  paddingBottom: 8,
                }}
              >
                Level {user.experience_level.level}
              </Text>
              <View
                style={{
                  paddingLeft: 32,
                  paddingRight: 32,
                }}
              >
                <Progress
                  progress={
                    (user.experience / user.experience_level.experience) * 100
                  }
                />
              </View>
              <Text
                style={{
                  paddingTop: 8,
                  textAlign: 'center',
                  fontFamily: 'Knockout',
                  fontSize: 20,
                }}
              >
                {user.experience} / {user.experience_level.experience} XP
              </Text>
              <View
                style={{
                  paddingTop: 24,
                  paddingBottom: 24,
                  flexDirection: 'row',
                  justifyContent: 'center',
                }}
              >
                {buttons?.map((button, index) => {
                  return (
                    <Pressable
                      key={index}
                      style={{
                        width: `${100 / buttons.length}%`,
                      }}
                    >
                      <Button onPress={button.screen}>
                        <Image
                          source={
                            button.text === 'Pins'
                              ? button.image
                              : {
                                  uri: button.image,
                                }
                          }
                          style={{
                            width: 80,
                            height: 80,
                            marginLeft: 'auto',
                            marginRight: 'auto',
                          }}
                          resizeMode="contain"
                        />
                      </Button>
                      <Text
                        style={{
                          paddingTop: 8,
                          textAlign: 'center',
                          fontFamily: 'Knockout',
                          textTransform: 'uppercase',
                          fontSize: 20,
                        }}
                      >
                        {button.text}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View
                style={{
                  position: 'relative',
                  width: '100%',
                  marginTop: 8,
                  marginBottom: 16,
                  flexDirection: 'row',
                  marginLeft: 0,
                }}
              >
                <View
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, .4)',
                    height: 2,
                    position: 'absolute',
                    width: '100%',
                    top: '50%',
                  }}
                />
                <View
                  style={{
                    backgroundColor: '#e2e8f0',
                    borderRadius: 6,
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 18,
                      textAlign: 'center',
                      textTransform: 'uppercase',
                      paddingTop: 8,
                      paddingBottom: 8,
                      paddingLeft: 12,
                      paddingRight: 12,
                      color: '#334155',
                    }}
                  >
                    Total activity
                  </Text>
                </View>
              </View>
              <View
                style={{
                  paddingLeft: 32,
                  paddingRight: 32,
                }}
              >
                <View>
                  <View
                    style={{
                      flexDirection: 'row',
                    }}
                  >
                    <Text
                      style={{
                        paddingRight: 12,
                        flex: 1,
                        fontFamily: 'Knockout',
                        textTransform: 'uppercase',
                        fontSize: 16,
                      }}
                    >
                      Shark coin balance
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        textTransform: 'uppercase',
                        fontSize: 16,
                        color: config.primary,
                      }}
                    >
                      {user.coins}
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                    }}
                  >
                    <Text
                      style={{
                        paddingRight: 12,
                        flex: 1,
                        fontFamily: 'Knockout',
                        textTransform: 'uppercase',
                        fontSize: 16,
                      }}
                    >
                      Parks visited
                    </Text>
                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        textTransform: 'uppercase',
                        fontSize: 16,
                        color: config.primary,
                      }}
                    >
                      {parks?.length ?? 0}
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                  }}
                >
                  <Text
                    style={{
                      paddingRight: 12,
                      flex: 1,
                      fontFamily: 'Knockout',
                      textTransform: 'uppercase',
                      fontSize: 16,
                    }}
                  >
                    Total XP
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      textTransform: 'uppercase',
                      fontSize: 16,
                      color: config.primary,
                    }}
                  >
                    {user.total_experience}
                  </Text>
                </View>
              </View>
            </View>
            <View
              style={{
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 16,
                paddingBottom: 32,
              }}
            >
              {parks?.map((park) => {
                return (
                  <Pressable
                    key={park.id}
                    onPress={() =>
                      navigation.navigate('Park', { park: park.id })
                    }
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingTop: 16,
                      paddingBottom: 16,
                    }}
                  >
                    <Image
                      source={{
                        uri: park.image_url,
                      }}
                      style={{
                        width: 100,
                        height: 100,
                        resizeMode: 'cover',
                        borderRadius: 20,
                      }}
                    />
                    <View
                      style={{
                        flex: 1,
                        paddingLeft: 24,
                      }}
                    >
                      <Text
                        style={{
                          paddingBottom: 8,
                          fontFamily: 'Knockout',
                          textTransform: 'uppercase',
                          fontSize: 16,
                        }}
                      >
                        {park.name}
                      </Text>
                      <Progress progress={park.completion_rate} />
                      <Text
                        style={{
                          paddingTop: 8,
                          fontFamily: 'Knockout',
                          textTransform: 'uppercase',
                          fontSize: 16,
                        }}
                      >
                        {park.completion_rate}% complete
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </ScrollView>
        )}
      </Wrapper>
    )
  );
}
