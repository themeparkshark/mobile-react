import { useCallback, useContext, useEffect, useState } from 'react';
import {
  Dimensions,
  Image,
  ImageBackground,
  Pressable,
  Text,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import RedeemModal from '../components/RedeemModal';
import TaskListModal from '../components/TaskListModal';
import Wrapper from '../components/Wrapper';
import checkForPark from '../helpers/check-for-park';
import checkForRedeemable from '../helpers/check-for-redeemable';
import getCurrentLocation from '../helpers/get-current-location';
import Button from '../components/Button';
import { AuthContext } from '../context/AuthProvider';
import * as RootNavigation from '../RootNavigation';
import NotAtPark from './ExploreScreen/NotAtPark';
import Topbar from '../components/Topbar';
import Playercard from '../components/Playercard';
import collectItem from '../helpers/collect-item';
import Coin from './ExploreScreen/Coin';
import dayjs from 'dayjs';
import { ParkType } from '../models/park-type';
import { LocationType } from '../models/location-type';
import { RedeemablesType } from '../models/redeemables-type';
import { RedeemableType } from '../models/redeemable-type';
import { ItemType } from '../models/item-type';
import { CoinType } from '../models/coin-type';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import YellowButton from '../components/YellowButton';

dayjs.extend(require('dayjs/plugin/isBetween'));

export default function ExploreScreen() {
  const [park, setPark] = useState<ParkType>();
  const [redeemables, setRedeemables] = useState<RedeemablesType | null>();
  const [activeRedeemable, setActiveRedeemable] = useState<
    RedeemableType | undefined
  >();
  const [location, setLocation] = useState<LocationType>();
  const { inventory, updateUser } = useContext(AuthContext);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Explore screen.');
    }, [])
  );

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
          setActiveRedeemable(undefined);
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
      checkForRedeemable().then((response) => setActiveRedeemable(response));
    }
  }, [location?.latitude, location?.longitude, redeemables]);

  return (
    <Wrapper>
      <Topbar showCoins={true} showPurpleDiamonds={true} />
      {!park && <NotAtPark />}
      {park && redeemables && (
        <>
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
          {inventory && (
            <View
              style={{
                position: 'absolute',
                bottom: 30,
                right: 16,
                zIndex: 10,
              }}
            >
              <View style={{
                marginBottom: 8,
              }}>
                <Button
                  onPress={() => {
                    RootNavigation.navigate('QueueTimes', {
                      park: park.id,
                    });
                  }}
                >
                  <Image
                    style={{
                      width: 70,
                      height: 84,
                      resizeMode: 'contain',
                    }}
                    source={require('../../assets/images/screens/explore/queuetimes.png')}
                  />
                </Button>
              </View>
              <View>
                <Button
                  onPress={() => {
                    RootNavigation.navigate('Inventory');
                  }}
                >
                  <ImageBackground
                    resizeMode={'contain'}
                    style={{
                      width: 70,
                      height: 84,
                      position: 'relative',
                    }}
                    source={require('../../assets/images/screens/explore/base.png')}
                  >
                    <Playercard
                      showBackground={false}
                      animate={false}
                      inventory={inventory}
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
            </View>
          )}
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
              redeemable={activeRedeemable}
              park={park}
              onPress={() => {
                getRedeemables();
                updateUser();
              }}
            />
          </View>
        </>
      )}
      <MapView
        style={{
          width: Dimensions.get('window').width,
          height: Dimensions.get('window').height - 188,
          marginTop: -8,
        }}
        showsUserLocation={true}
        showsIndoors={false}
        zoomEnabled={true}
        rotateEnabled={false}
        scrollEnabled={true}
        followsUserLocation={true}
        pitchEnabled={false}
        loadingEnabled={true}
        userInterfaceStyle={'light'}
      >
        {redeemables?.items
          .filter((item) => !item.is_hidden)
          .map((item) => {
            return (
              <Marker
                key={item.id}
                coordinate={{
                  latitude: item.latitude,
                  longitude: item.longitude,
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
            >
              <Image
                source={require('../../assets/images/screens/explore/task_animation.gif')}
                style={{
                  width: 80,
                  height: 80,
                  resizeMode: 'contain',
                }}
              />
            </Marker>
          );
        })}
        {redeemables?.coins
          .filter((coin) => {
            return dayjs().isBetween(
              dayjs(coin.active_from),
              dayjs(coin.active_to)
            );
          })
          .map((coin) => {
            return (
              <Marker
                key={coin.id}
                coordinate={{
                  latitude: coin.latitude,
                  longitude: coin.longitude,
                }}
              >
                <Coin coin={coin} onExpire={() => getRedeemables()} />
              </Marker>
            );
          })}
      </MapView>
    </Wrapper>
  );
}
