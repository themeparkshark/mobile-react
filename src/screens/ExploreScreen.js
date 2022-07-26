import { useEffect, useState, useContext } from 'react';
import { Image, Dimensions, ImageBackground, View, Text, Pressable } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import RedeemModal from '../components/RedeemModal';
import TaskListModal from '../components/TaskListModal';
import Wrapper from '../components/Wrapper';
import checkForPark from '../helpers/check-for-park';
import checkForRedeemable from '../helpers/check-for-redeemable';
import getCurrentLocation from '../helpers/get-current-location';
import Button from '../components/Button';
import { ThemeContext } from '../context/ThemeProvider';
import * as RootNavigation from '../RootNavigation';
import NotAtPark from './ExploreScreen/NotAtPark';
import Topbar from '../components/Topbar';
import Playercard from '../components/Playercard';
import collectItem from '../helpers/collect-item';

export default function ExploreScreen() {
  const [park, setPark] = useState(null);
  const [redeemables, setRedeemables] = useState(null);
  const [activeRedeemable, setActiveRedeemable] = useState(null);
  const [location, setLocation] = useState(null);
  const { theme } = useContext(ThemeContext);

  const getRedeemables = () => {
    currentRedeemables().then((response) => setRedeemables(response));
  };

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
          setActiveRedeemable(null);
        }
      });
    }
  }, [location?.latitude, location?.longitude]);

  useEffect(() => {
    if (park) {
      getRedeemables();
    }
  }, [park?.id]);

  useEffect(() => {
    if (location && redeemables) {
      setActiveRedeemable(checkForRedeemable(redeemables, location));
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
                source={{
                  uri: theme.base_button_url
                }}
              >
                <Playercard
                  showBackground={false}
                  animate={false}
                  style={{
                    position: 'absolute',
                    width: 100,
                    height: 100,
                    left: -14,
                    top: -15,
                  }}
                />
              </ImageBackground>
            </Button>
          </View>
          {activeRedeemable && (
            <View
              style={{
                bottom: 60,
                position: 'absolute',
                alignSelf: 'center',
                flexDirection: 'row',
                zIndex: 10,
              }}
            >
              {activeRedeemable.type === 'task' || activeRedeemable.type === 'secret_task' || activeRedeemable.type === 'coin' && (
                <RedeemModal
                  redeemable={activeRedeemable.model}
                  onPress={() => getRedeemables()}
                />
              )}
              {activeRedeemable.type === 'item' && !activeRedeemable.model.pivot.hidden (
                <Pressable
                  onPress={async () => {
                    await collectItem(activeRedeemable.model, () => getRedeemables());
                  }}
                >
                  <Text
                    style={{
                      backgroundColor: 'orange',
                      padding: 16,
                      borderRadius: 6,
                      overflow: 'hidden',
                    }}
                  >
                    Collect Item
                  </Text>
                </Pressable>
              )}
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
        {redeemables?.items.map((item) => {
          return (
            <Marker
              key={item.id}
              coordinate={{
                latitude: item.pivot.latitude,
                longitude: item.pivot.longitude,
              }}
              centerOffset={{
                x: 0,
                y: 0,
              }}
              tracksViewChanges={false}
              stopPropagation={true}
            >
              <Image
                source={{
                  uri: item.icon_url,
                }}
                style={{
                  width: 60,
                  height: 60,
                }}
              />
            </Marker>
          );
        })}
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
