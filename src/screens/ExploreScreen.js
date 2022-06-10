import { useEffect, useState } from 'react';
import { Dimensions, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import checkForPark from '../helpers/check-for-park';
import checkForRedeemable from '../helpers/check-for-redeemable';
import getCurrentLocation from '../helpers/get-current-location';

export default function App() {
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
        console.log('park set');
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
    <View style={styles.container}>
      <Text>
        {park?.name
          ? 'You are currently at ' + park?.name
          : 'You are not at a park'}
      </Text>
      <Text>You can currently redeem: {inRedeemZone?.name}</Text>
      <Text>Redeemables: {redeemables?.tasks.length}</Text>
      <MapView
        showsUserLocation={true}
        style={styles.map}
        followsUserLocation={true}
        showsIndoors={false}
        maxZoomLevel={20}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  map: {
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height - 150,
  },
});
