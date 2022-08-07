import { useContext, useEffect, useState } from 'react';
import { Dimensions, Pressable, ScrollView, Text, Image, View } from 'react-native';
import getParks from '../api/endpoints/me/visited-parks';
import getStores from '../api/endpoints/stores/stores';
import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import Progress from '../components/Progress';
import Playercard from '../components/Playercard';
import { ThemeContext } from '../context/ThemeProvider';
import Button from '../components/Button';
import * as RootNavigation from '../RootNavigation';
import { AuthContext } from '../context/AuthProvider';

export default function NewsScreen({ navigation }) {
  const [parks, setParks] = useState(null);
  const [stores, setStores] = useState(null);
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    getParks().then((response) => setParks(response));
    getStores().then((response) => setStores(response));
  }, []);

  return (
    <Wrapper>
      <Topbar text={user?.username} />
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
          <Playercard
            style={{
              position: 'absolute',
              width: Dimensions.get('window').width,
              height: 455,
              marginTop: -55,
            }}
          />
        </Pressable>
        <View
          style={{
            borderTopStyle: 'solid',
            borderTopWidth: 5,
            borderTopColor: theme.primary_color,
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
            Level {user?.experience_level.level}
          </Text>
          <View
            style={{
              paddingLeft: 32,
              paddingRight: 32,
            }}
          >
            <Progress progress={user?.experience / user?.experience_level.experience * 100} />
          </View>
          <Text
            style={{
              paddingTop: 8,
              textAlign: 'center',
              fontFamily: 'Knockout',
              fontSize: 20,
            }}
          >
            {user?.experience} / {user?.experience_level.experience} XP
          </Text>
          <View
            style={{
              paddingTop: 24,
              paddingBottom: 24,
              flexDirection: 'row',
              justifyContent: 'center',
            }}
          >
            <Pressable
              style={{
                width: '33.33333%',
              }}
            >
              <Button
                onPress={() => RootNavigation.navigate('PinCollections')}
              >
                <Image
                  source={{
                    uri: theme.pin_collections_button_url,
                  }}
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
                Pins
              </Text>
            </Pressable>
            {stores?.map((store) => {
              return (
                <Pressable
                  key={store.id}
                  style={{
                    width: '33.33333%',
                  }}
                >
                  <Button
                    onPress={() => {
                      RootNavigation.navigate('Store', {
                        store: store.id,
                      });
                    }}
                  >
                    <Image
                      source={{
                        uri: store.icon_url,
                      }}
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
                    {store.name}
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
                  color: '#334155'
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
                    color: theme.primary_color,
                  }}
                >
                  {user?.coins}
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
                    color: theme.primary_color,
                  }}
                >
                  {parks?.length}
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
                  color: theme.primary_color,
                }}
              >
                {user?.total_experience}
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
                onPress={() => navigation.navigate('Park', { park: park.id })}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingTop: 16,
                  paddingBottom: 16,
                }}
              >
                <Image
                  source={{
                    uri: park.image_url
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
    </Wrapper>
  );
}
