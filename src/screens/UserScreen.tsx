import { useCallback, useEffect, useState } from 'react';
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
import config from '../config';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import Loading from '../components/Loading';
import Experience from '../components/Experience';
import Heading from '../components/Heading';
import Activity from '../components/Activity';
import getVisitedParks from '../api/endpoints/users/visited-parks';

export default function UserScreen({ navigation, route }) {
  const { user } = route.params;
  const [loading, setLoading] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<UserType>();
  const [parks, setParks] = useState<ParkType[]>([]);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the User screen.');
    }, [])
  );

  useEffect(() => {
    (async () => {
      setLoading(true);
      setCurrentUser(await getUser(user));
      setParks(await getVisitedParks(user));
      setLoading(false);
    })();
  }, []);

  return (
    <>
      <Topbar text={currentUser?.screen_name} showBackButton={true} />
      {loading && <Loading />}
      {!loading && currentUser && (
        <ScrollView
          style={{
            flex: 1,
            marginTop: -8,
          }}
        >
          <View
            style={{
              paddingBottom: 32,
            }}
          >
            <View
              style={{
                height: 315,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
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
            </View>
            <View
              style={{
                borderTopWidth: 5,
                borderTopColor: config.primary,
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 24,
              }}
            >
              <Experience user={currentUser} />
              <Heading text="Total Activity" />
              <Activity user={currentUser} />
              <Heading text="Leaderboard Standings" />
              <Heading text="Pending Trades" />
              <Heading text="Items" />
              <Heading text="Visited Parks" />
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
          </View>
        </ScrollView>
      )}
    </>
  );
}
