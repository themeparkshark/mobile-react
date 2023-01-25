import { useCallback, useEffect, useState } from 'react';
import { Dimensions, ScrollView, View } from 'react-native';
import getUser from '../api/endpoints/users/get';
import Topbar from '../components/Topbar';
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
import Tooltip from 'rn-tooltip';
import VisitedParks from '../components/VisitedParks';
import Verified from '../components/Verified';

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
              {currentUser.verified_at && <Verified />}
              <Heading text="Total Activity" />
              <Activity user={currentUser} />
              {parks.length > 0 && (
                <>
                  <Heading text="Visited Parks" />
                  <VisitedParks parks={parks} />
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </>
  );
}
