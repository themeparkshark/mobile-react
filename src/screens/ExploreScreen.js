import { useEffect, useState } from 'react';
import { Dimensions, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import RedeemModal from '../components/RedeemModal';
import TaskListModal from '../components/TaskListModal';
import Wrapper from '../components/Wrapper';
import checkForPark from '../helpers/check-for-park';
import checkForRedeemable from '../helpers/check-for-redeemable';
import getCurrentLocation from '../helpers/get-current-location';
import NotAtPark from './ExploreScreen/NotAtPark';
import Topbar from '../components/Topbar';

export default function ExploreScreen() {
  const [park, setPark] = useState(null);
  const [redeemables, setRedeemables] = useState(null);
  const [inRedeemZone, setInRedeemZone] = useState(null);
  const [location, setLocation] = useState(null);

  useEffect(() => {
    getCurrentLocation().then((response) => setLocation(response));

    const interval = setInterval(() => {
      getCurrentLocation().then((response) => setLocation(response));
    }, 10 * 1000);

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
  }, [location?.latitude, location?.longitude]);

  useEffect(() => {
    if (park) {
      currentRedeemables().then((response) => setRedeemables(response));
    }
  }, [park?.id]);

  useEffect(() => {
    if (location && redeemables) {
      setInRedeemZone(checkForRedeemable(redeemables, location));
    }
  }, [location?.latitude, location?.longitude, redeemables]);

  return (
    <Wrapper>
      {!park && <NotAtPark /> }
      {park && (
        <>
          <Topbar text={park.name} />
          <View
            style={{
              position: 'absolute',
              bottom: 90,
              left: 12,
              zIndex: 10,
            }}
          >
            <TaskListModal redeemables={redeemables} />
          </View>
          {inRedeemZone && (
            <View
              style={{
                position: 'absolute',
                backgroundColor: 'red',
                bottom: 90,
                zIndex: 10,
                flexDirection: 'row',
                justifyContent: 'center',
              }}
            >
              <RedeemModal
                redeemable={inRedeemZone}
                onPress={() => {
                  currentRedeemables().then((response) => setRedeemables(response));
                }}
              />
            </View>
          )}
        </>
      )}
      <MapView
        style={{
          width: Dimensions.get('window').width,
          flex: 1,
        }}
        showsUserLocation={true}
        showsIndoors={false}
        zoomEnabled={false}
        rotateEnabled={false}
        scrollEnabled={false}
        followsUserLocation={true}
        pitchEnabled={false}
        loadingEnabled={true}
        userInterfaceStyle={'light'}
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
