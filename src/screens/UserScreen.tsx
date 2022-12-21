import { useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import getUser from '../api/endpoints/users/get';
import Topbar from '../components/Topbar';
import Progress from '../components/Progress';
import Playercard from '../components/Playercard';
import { ParkType } from '../models/park-type';
import { UserType } from '../models/user-type';
import theme from '../config/theme';

export default function UserScreen({ navigation, route }) {
  const { user } = route.params;
  const [parks, setParks] = useState<ParkType[]>();
  const [currentUser, setCurrentUser] = useState<UserType>();

  useEffect(() => {
    getUser(user).then((response) => setCurrentUser(response));
  }, []);

  return (
    <>
      <Topbar text={currentUser?.username} showBackButton={true} />
      <ScrollView
        style={{
          flex: 1,
          marginTop: -8,
        }}
      >
        <View
          style={{
            height: 315,
            overflow: 'hidden',
            position: 'relative',
          }}
        >
          {currentUser && (
            <Playercard
              user={currentUser}
              inventory={currentUser.inventory}
              style={{
                position: 'absolute',
                width: Dimensions.get('window').width,
                height: 455,
                marginTop: -55,
              }}
            />
          )}
        </View>
        <View
          style={{
            borderTopStyle: 'solid',
            borderTopWidth: 5,
            borderTopColor: theme.primary,
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
            Level {currentUser?.experience_level.level}
          </Text>
          <View
            style={{
              paddingLeft: 32,
              paddingRight: 32,
            }}
          >
            <Progress
              progress={
                (currentUser?.experience /
                  currentUser?.experience_level.experience) *
                100
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
            {currentUser?.experience} /{' '}
            {currentUser?.experience_level.experience} XP
          </Text>
          <View
            style={{
              position: 'relative',
              width: '100%',
              marginTop: 16,
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
                  Parks visited
                </Text>
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    textTransform: 'uppercase',
                    fontSize: 16,
                    color: theme.primary,
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
                  color: theme.primary,
                }}
              >
                {currentUser?.total_experience}
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
    </>
  );
}
