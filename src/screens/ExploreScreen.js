import { useEffect, useState } from 'react';
import {
  Dimensions,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useTailwind } from 'tailwind-rn';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import completeTask from '../api/endpoints/me/tasks/complete-task';
import Wrapper from '../components/Wrapper';
import checkForPark from '../helpers/check-for-park';
import checkForRedeemable from '../helpers/check-for-redeemable';
import getCurrentLocation from '../helpers/get-current-location';

export default function ExploreScreen() {
  const tailwind = useTailwind();
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

  const completeRedeemable = async (redeemable) => {
    await completeTask(redeemable);
  };

  return (
    <Wrapper>
      <SafeAreaView style={tailwind('absolute justify-end w-full h-full z-50')}>
        {inRedeemZone && (
          <View style={tailwind('flex-row justify-center')}>
            <TouchableOpacity
              onPress={() => {
                completeRedeemable(inRedeemZone);
              }}
              style={tailwind('bg-indigo-500 p-4')}
            >
              <Text style={tailwind('text-white')}>Redeem zone</Text>
            </TouchableOpacity>
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
