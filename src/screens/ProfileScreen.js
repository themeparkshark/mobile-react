import { useEffect, useState } from 'react';
import { Dimensions, Pressable, ScrollView, Text, Image, View } from 'react-native';
import getMe from '../api/endpoints/me/me';
import getParks from '../api/endpoints/me/visited-parks';
import getInventory from '../api/endpoints/me/inventory';
import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import Progress from '../components/Progress';
import Playercard from '../components/Playercard';

export default function NewsScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [parks, setParks] = useState(null);
  const [inventory, setInventory] = useState(null);

  useEffect(() => {
    getMe().then((response) => setUser(response));
    getParks().then((response) => setParks(response));
    getInventory().then((response) => setInventory(response));
  }, []);

  return (
    <Wrapper>
      <Topbar text={user?.username} />
      <ScrollView>
        { inventory && (
          <View
            style={{
              height: 300,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Playercard
              inventory={inventory}
              style={{
                position: 'absolute',
                marginTop: -90,
              }}
            />
          </View>
        )}
        <View
          style={{
            borderTopStyle: 'solid',
            borderTopWidth: 5,
            borderTopColor: '#09268f',
            paddingLeft: 64,
            paddingRight: 64,
            paddingTop: 32,
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
          <Progress progress={user?.experience / user?.experience_level.experience * 100} />
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
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 26,
              textAlign: 'center',
              textTransform: 'uppercase',
              paddingTop: 32,
              paddingBottom: 16,
            }}
          >
            Total activity
          </Text>
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
                Total shark coins
              </Text>
              <Text
                style={{
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  fontSize: 16,
                  color: '#09268f',
                }}
              >
                {user?.total_coins}
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
                Shark coin balance
              </Text>
              <Text
                style={{
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  fontSize: 16,
                  color: '#09268f',
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
                  color: '#09268f',
                }}
              >
                {parks?.length}
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
                Total XP
              </Text>
              <Text
                style={{
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  fontSize: 16,
                  color: '#09268f',
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
