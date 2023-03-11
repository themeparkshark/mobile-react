import { faLocationArrow as faSolidArrow } from '@fortawesome/free-solid-svg-icons/faLocationArrow';
import { faLocationArrow } from '@fortawesome/pro-light-svg-icons/faLocationArrow';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Dimensions, Pressable, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useTimeoutWhen } from 'rooks';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import RedeemModal from '../components/RedeemModal';
import TaskListModal from '../components/TaskListModal';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import { MusicContext } from '../context/MusicProvider';
import checkForPark from '../helpers/check-for-park';
import checkForRedeemable from '../helpers/check-for-redeemable';
import { ParkType } from '../models/park-type';
import { RedeemableType } from '../models/redeemable-type';
import { RedeemablesType } from '../models/redeemables-type';
import * as RootNavigation from '../RootNavigation';
import Coin from './ExploreScreen/Coin';
import NotAtPark from './ExploreScreen/NotAtPark';

dayjs.extend(require('dayjs/plugin/isBetween'));

export default function ExploreScreen() {
  const [park, setPark] = useState<ParkType>();
  const [redeemables, setRedeemables] = useState<RedeemablesType | null>();
  const [activeRedeemable, setActiveRedeemable] = useState<
    RedeemableType | undefined
  >();
  const { inventory, refreshUser, user } = useContext(AuthContext);
  const [focusedOnUser, setFocusedOnUser] = useState<boolean>(true);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const { playMusic } = useContext(MusicContext);
  const { location } = useContext(LocationContext);

  useFocusEffect(
    useCallback(() => {
      playMusic(require('../../assets/sounds/music/track5.mp3'));
    }, [])
  );

  useTimeoutWhen(
    () => {
      setFocusedOnUser(true);
    },
    1000,
    mapReady
  );

  const getRedeemables = () => {
    setActiveRedeemable(undefined);
    currentRedeemables().then((response) => setRedeemables(response));
  };

  useEffect(() => {
    checkForPark().then((response) => {
      setPark(response);

      if (response === null) {
        setRedeemables(null);
        setActiveRedeemable(undefined);
      }
    });
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

  if (!user) {
    return <></>;
  }

  return (
    <Wrapper>
      <Topbar
        parkCoin={park?.coin_url}
        showCoins
        showKeys
        parkCoins={park?.park_coins_count}
      />
      {!park && <NotAtPark />}
      {park && redeemables && (
        <>
          <View
            style={{
              position: 'absolute',
              top: 200,
              right: 16,
              zIndex: 10,
            }}
          >
            <Pressable
              onPress={() => setFocusedOnUser(true)}
              style={{
                padding: 12,
              }}
            >
              <FontAwesomeIcon
                icon={focusedOnUser ? faSolidArrow : faLocationArrow}
                size={30}
                color={config.primary}
              />
            </Pressable>
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: 16,
              zIndex: 10,
              width: '100%',
              flexDirection: 'row',
              alignItems: 'flex-end',
            }}
            pointerEvents="box-none"
          >
            <View
              style={{
                padding: 16,
              }}
            >
              <View
                style={{
                  marginBottom: -4,
                }}
              >
                <TaskListModal redeemables={redeemables} />
              </View>
            </View>
            <View
              style={{
                flex: 1,
                padding: 16,
              }}
            >
              <View
                style={{
                  paddingBottom: 48,
                }}
              >
                <RedeemModal
                  redeemable={activeRedeemable}
                  park={park}
                  onPress={() => {
                    getRedeemables();
                    refreshUser();
                  }}
                />
              </View>
            </View>
            <View
              style={{
                padding: 16,
              }}
            >
              {park.store && (
                <Button
                  onPress={() => {
                    RootNavigation.navigate('Store', {
                      store: park.store.id,
                    });
                  }}
                >
                  <Image
                    style={{
                      width: 70,
                      height: 84,
                    }}
                    source={{
                      uri: park.store.icon_url,
                    }}
                    contentFit="contain"
                  />
                </Button>
              )}
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
                  }}
                  source={require('../../assets/images/screens/explore/queuetimes.png')}
                  contentFit="contain"
                />
              </Button>
              {inventory && (
                <Button
                  onPress={() => {
                    RootNavigation.navigate('Inventory');
                  }}
                >
                  <Avatar user={user} size={70} />
                </Button>
              )}
            </View>
          </View>
        </>
      )}
      <View
        style={{
          backgroundColor: 'red',
          flex: 1,
          marginTop: -8,
        }}
      >
        <MapView
          style={{
            width: Dimensions.get('window').width,
            height: '100%',
          }}
          showsUserLocation={true}
          showsIndoors={false}
          rotateEnabled={false}
          region={focusedOnUser ? location : undefined}
          initialRegion={location}
          pitchEnabled={false}
          loadingEnabled={true}
          userInterfaceStyle="light"
          onMapReady={() => setMapReady(true)}
          onRegionChangeComplete={() => setFocusedOnUser(false)}
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
                    source={require('../../assets/images/screens/explore/item_animation.gif')}
                    contentFit="contain"
                    style={{
                      width: 70,
                      height: 70,
                    }}
                  />
                </Marker>
              );
            })}
          {redeemables?.pins
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
                    source={require('../../assets/images/screens/explore/pin_animation.gif')}
                    contentFit="contain"
                    style={{
                      width: 70,
                      height: 70,
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
                    width: 120,
                    height: 120,
                  }}
                  contentFit="contain"
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
          {redeemables?.vaults.map((vault) => {
            return (
              <Marker
                key={vault.id}
                coordinate={{
                  latitude: vault.latitude,
                  longitude: vault.longitude,
                }}
              >
                <Image
                  source={require('../../assets/images/screens/explore/vault.png')}
                  style={{
                    width: 120,
                    height: 120,
                  }}
                  contentFit="contain"
                />
              </Marker>
            );
          })}
        </MapView>
      </View>
    </Wrapper>
  );
}
