import { useEffect, useState } from 'react';
import { Dimensions, SafeAreaView, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import RedeemModal from '../components/RedeemModal';
import TaskListModal from '../components/TaskListModal';
import Wrapper from '../components/Wrapper';
import checkForPark from '../helpers/check-for-park';
import checkForRedeemable from '../helpers/check-for-redeemable';
import getCurrentLocation from '../helpers/get-current-location';

export default function ExploreScreen() {
  const [park, setPark] = useState(null);
  const [redeemables, setRedeemables] = useState(null);
  const [inRedeemZone, setInRedeemZone] = useState(null);
  const [location, setLocation] = useState(null);

  useEffect(() => {
    const interval = setInterval(() => {
      getCurrentLocation().then((response) => {
        setLocation(response);
      });
    }, 60 * 1000);

    getCurrentLocation().then((response) => {
      setLocation(response);
    });

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (location) {
      checkForPark().then((response) => {
        setPark(response);

        if (response === null) {
          setRedeemables(null);
          setInRedeemZone(null);
        }
      });
    }
  }, [location]);

  useEffect(() => {
    if (park) {
      currentRedeemables().then((response) => {
        setRedeemables(response);
      });
    }
  }, [park]);

  useEffect(() => {
    if (location && redeemables) {
      setInRedeemZone(checkForRedeemable(redeemables, location));
    }
  }, [location, redeemables]);

  return (
    <Wrapper>
      <SafeAreaView
        style={{
          position: 'absolute',
          justifyContent: 'flex-end',
          width: '100%',
          height: '100%',
          zIndex: 10,
        }}
      >
        {park && (
          <View>
            <View style={{ flexDirection: 'row' }}>
              <TaskListModal
                trigger={<Text>View task list</Text>}
                redeemables={redeemables}
              />
            </View>
          </View>
        )}
        {inRedeemZone && (
          <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
            <RedeemModal
              redeemable={inRedeemZone}
              onPress={() => {
                currentRedeemables().then((response) => {
                  setRedeemables(response);
                });
              }}
            />
          </View>
        )}
      </SafeAreaView>
      <MapView
        showsUserLocation={true}
        style={{
          width: Dimensions.get('window').width,
          height: Dimensions.get('window').height,
        }}
        followsUserLocation={true}
        showsIndoors={false}
        minZoomLevel={18}
        rotateEnabled={false}
        scrollEnabled={false}
        pitchEnabled={false}
        loadingEnabled={true}
      >
        {redeemables?.tasks.map((task) => {
          return (
            <Marker
              key={task.id}
              coordinate={{
                latitude: task.latitude,
                longitude: task.longitude,
              }}
            />
          );
        })}
      </MapView>
    </Wrapper>
  );
}
