import { useEffect, useState, useContext } from 'react';
import { Dimensions, Image, ImageBackground, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import RedeemModal from '../components/RedeemModal';
import TaskListModal from '../components/TaskListModal';
import Wrapper from '../components/Wrapper';
import checkForPark from '../helpers/check-for-park';
import checkForRedeemable from '../helpers/check-for-redeemable';
import getCurrentLocation from '../helpers/get-current-location';
import inventory from '../../assets/images/screens/explore/inventory.png';
import Button from '../components/Button';
import { AuthContext } from '../context/AuthProvider';
import * as RootNavigation from '../RootNavigation';
import NotAtPark from './ExploreScreen/NotAtPark';
import Topbar from '../components/Topbar';

export default function ExploreScreen() {
  const [park, setPark] = useState(null);
  const [redeemables, setRedeemables] = useState(null);
  const [inRedeemZone, setInRedeemZone] = useState(null);
  const [location, setLocation] = useState(null);
  const { user } = useContext(AuthContext);

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
              bottom: 30,
              left: 12,
              zIndex: 10,
            }}
          >
            <TaskListModal redeemables={redeemables} />
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: 30,
              right: 16,
              zIndex: 10,
            }}
          >
            <Button
              onPress={() => {
                RootNavigation.navigate('Inventory');
              }}
            >
              <ImageBackground
                style={{
                  width: 70,
                  height: 84,
                  resizeMode: 'contain',
                  position: 'relative',
                }}
                source={inventory}
              >
                <Image
                  style={{
                    position: 'absolute',
                    resizeMode: 'contain',
                    width: 100,
                    height: 100,
                    left: -14,
                    top: -10,
                  }}
                  source={{
                    uri: user?.avatar_url
                  }}
                />
              </ImageBackground>
            </Button>
          </View>
          {inRedeemZone && (
            <View
              style={{
                bottom: 60,
                position: 'absolute',
                alignSelf: 'center',
                flexDirection: 'row',
                zIndex: 10,
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
