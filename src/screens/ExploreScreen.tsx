import { faLocationArrow as faSolidArrow } from '@fortawesome/free-solid-svg-icons/faLocationArrow';
import { faLocationArrow } from '@fortawesome/pro-light-svg-icons/faLocationArrow';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { useCallback, useContext, useState } from 'react';
import { Dimensions, Image, Pressable, View } from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { useAsyncEffect, useTimeoutWhen } from 'rooks';
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
import { ThemeContext } from '../context/ThemeProvider';
import checkForRedeemable from '../helpers/check-for-redeemable';
import { RedeemableType } from '../models/redeemable-type';
import { RedeemablesType } from '../models/redeemables-type';
import * as RootNavigation from '../RootNavigation';
import Coin from './ExploreScreen/Coin';
import Key from './ExploreScreen/Key';
import NotAtPark from './ExploreScreen/NotAtPark';
import Pumpkin from './ExploreScreen/Pumpkin';

dayjs.extend(require('dayjs/plugin/isBetween'));

export default function ExploreScreen() {
  const [redeemables, setRedeemables] = useState<RedeemablesType | null>();
  const [activeRedeemable, setActiveRedeemable] = useState<
    RedeemableType | undefined
  >();
  const { inventory, refreshUser, user } = useContext(AuthContext);
  const [focusedOnUser, setFocusedOnUser] = useState<boolean>(true);
  const [mapReady, setMapReady] = useState<boolean>(false);
  const { playMusic } = useContext(MusicContext);
  const { location, park } = useContext(LocationContext);
  const { theme } = useContext(ThemeContext);

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

  const getRedeemables = async () => {
    setActiveRedeemable(undefined);
    const response = await currentRedeemables();
    setRedeemables(response);
  };

  useAsyncEffect(async () => {
    if (!park) {
      setRedeemables(null);
      setActiveRedeemable(undefined);

      return;
    }

    await getRedeemables();
  }, [park?.id]);

  useAsyncEffect(async () => {
    if (!location || !redeemables) {
      return;
    }

    const response = await checkForRedeemable();
    setActiveRedeemable(response);
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
        showPumpkins={theme?.show_pumpkin_currency}
        parkCoins={park?.park_coins_count}
      />
      {!park && <NotAtPark />}
      {park && redeemables && (
        <>
          <View
            style={{
              position: 'absolute',
              top: 132,
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
              left: 16,
              bottom: 32,
              zIndex: 10,
            }}
          >
            {theme.store && (
              <View
                style={{
                  marginBottom: 8,
                }}
              >
                <Button
                  onPress={() => {
                    RootNavigation.navigate('Store', {
                      store: theme.store.id,
                    });
                  }}
                >
                  <Image
                    style={{
                      width: 70,
                      height: 75,
                    }}
                    source={{
                      uri: theme.store.icon_url,
                    }}
                    resizeMode="contain"
                  />
                </Button>
              </View>
            )}
            {park.store && (
              <View
                style={{
                  marginBottom: 8,
                }}
              >
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
                      height: 75,
                    }}
                    source={{
                      uri: park.store.icon_url,
                    }}
                    resizeMode="contain"
                  />
                </Button>
              </View>
            )}
            <TaskListModal redeemables={redeemables} />
          </View>
          <View
            style={{
              position: 'absolute',
              bottom: -50,
              zIndex: 10,
              left: '25%',
              width: '50%',
            }}
          >
            <RedeemModal
              redeemable={activeRedeemable}
              park={park}
              onPress={async () => {
                await getRedeemables();
                await refreshUser();
              }}
            />
          </View>
          <View
            style={{
              position: 'absolute',
              right: 16,
              bottom: 32,
              zIndex: 10,
            }}
          >
            <View
              style={{
                marginBottom: 8,
              }}
            >
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
                    height: 72,
                  }}
                  source={require('../../assets/images/screens/explore/queuetimes.png')}
                  resizeMode="contain"
                />
              </Button>
            </View>
            {inventory && (
              <Button
                onPress={() => {
                  RootNavigation.navigate('Inventory');
                }}
              >
                <Avatar user={user} size="lg" />
              </Button>
            )}
          </View>
        </>
      )}
      <View
        style={{
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
                    resizeMode="contain"
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
                    resizeMode="contain"
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
                  latitude: Number(task.latitude),
                  longitude: Number(task.longitude),
                }}
              >
                <Image
                  source={require('../../assets/images/screens/explore/task_animation.gif')}
                  style={{
                    width: 120,
                    height: 120,
                  }}
                  resizeMode="contain"
                />
              </Marker>
            );
          })}
          {redeemables?.coins
            .filter((coin) =>
              dayjs().isBetween(dayjs(coin.active_from), dayjs(coin.active_to))
            )
            .map((coin) => {
              return (
                <Marker
                  key={coin.id}
                  coordinate={{
                    latitude: Number(coin.latitude),
                    longitude: Number(coin.longitude),
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
                  latitude: Number(vault.latitude),
                  longitude: Number(vault.longitude),
                }}
              >
                <Image
                  source={require('../../assets/images/screens/explore/vault_animation.gif')}
                  style={{
                    width: 70,
                    height: 70,
                  }}
                  resizeMode="contain"
                />
              </Marker>
            );
          })}
          {redeemables?.keys
            .filter((key) =>
              dayjs().isBetween(dayjs(key.active_from), dayjs(key.active_to))
            )
            .map((key) => {
              return (
                <Marker
                  key={key.id}
                  coordinate={{
                    latitude: Number(key.latitude),
                    longitude: Number(key.longitude),
                  }}
                >
                  <Key model={key} onExpire={() => getRedeemables()} />
                </Marker>
              );
            })}
          {redeemables?.pumpkins
            .filter((pumpkin) =>
              dayjs().isBetween(
                dayjs(pumpkin.active_from),
                dayjs(pumpkin.active_to)
              )
            )
            .map((pumpkin) => {
              return (
                <Marker
                  key={pumpkin.id}
                  coordinate={{
                    latitude: Number(pumpkin.latitude),
                    longitude: Number(pumpkin.longitude),
                  }}
                >
                  <Pumpkin model={pumpkin} onExpire={() => getRedeemables()} />
                </Marker>
              );
            })}
        </MapView>
      </View>
    </Wrapper>
  );
}
