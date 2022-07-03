import { useEffect, useState, useContext } from 'react';
import { Dimensions, Image, ImageBackground, SafeAreaView, Text, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import RedeemModal from '../components/RedeemModal';
import TaskListModal from '../components/TaskListModal';
import Wrapper from '../components/Wrapper';
import checkForPark from '../helpers/check-for-park';
import checkForRedeemable from '../helpers/check-for-redeemable';
import getCurrentLocation from '../helpers/get-current-location';
import { BlurView } from 'expo-blur';
import topbar from '../../assets/images/screens/explore/topbar.png';
import inventory from '../../assets/images/screens/explore/inventory.png';
import Button from '../components/Button';
import { AuthContext } from '../context/AuthProvider';
import * as RootNavigation from '../RootNavigation';

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
      currentRedeemables().then((response) => {
        setRedeemables(response);
      });
    }
  }, [park?.id]);

  useEffect(() => {
    if (location && redeemables) {
      setInRedeemZone(checkForRedeemable(redeemables, location));
    }
  }, [location?.latitude, location?.longitude, redeemables]);

  return (
    <Wrapper>
      {!park &&
        <BlurView
          intensity={80}
          tint="dark"
          style={{
            zIndex: 10,
            resizeMode: 'contain',
            alignSelf: 'center',
            position: 'absolute',
            width: Dimensions.get('window').width,
            height: Dimensions.get('window').height,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              color: 'white',
              fontSize: 32,
              paddingLeft: 48,
              paddingRight: 48,
              textAlign: 'center',
            }}
          >
            You are not at a park right now.
          </Text>
        </BlurView>
      }
      {park && (
        <SafeAreaView
          style={{
            position: 'absolute',
            top: 0,
            zIndex: 10,
            width: '100%',
          }}
        >
          <ImageBackground
            source={topbar}
            resizeMode="cover"
            style={{
              height: 120,
              top: -50,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
            }}
          >
            <Text
              style={{
                textAlign: 'center',
                fontSize: 28,
                color: 'white',
                paddingLeft: 12,
                paddingRight: 12,
                paddingBottom: 28,
              }}
            >
              {park.name}
            </Text>
          </ImageBackground>
        </SafeAreaView>
      )}
      <View style={{ position: 'relative' }}>
        {park && (
          <>
            <View
              style={{
                position: 'absolute',
                bottom: 120,
                left: 12,
                zIndex: 10,
              }}
            >
              <TaskListModal redeemables={redeemables} />
            </View>
            <View
              style={{
                position: 'absolute',
                bottom: 120,
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
          </>
        )}
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
                currentRedeemables().then((response) => {
                  setRedeemables(response);
                });
              }}
            />
          </View>
        )}
        <MapView
          style={{
            width: Dimensions.get('window').width,
            height: Dimensions.get('window').height,
          }}
          showsUserLocation={true}
          showsIndoors={false}
          zoomEnabled={false}
          rotateEnabled={false}
          scrollEnabled={true}
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
      </View>
    </Wrapper>
  );
}
