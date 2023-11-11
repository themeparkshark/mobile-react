import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useCallback, useContext, useState } from 'react';
import { Text, View } from 'react-native';
import { Callout, Marker } from 'react-native-maps';
import { useAsyncEffect } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Map from '../components/Map';
import RedeemModal from '../components/RedeemModal';
import TaskListModal from '../components/TaskListModal';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import { MusicContext } from '../context/MusicProvider';
import { ThemeContext } from '../context/ThemeProvider';
import checkForRedeemable from '../helpers/check-for-redeemable';
import { RedeemableType } from '../models/redeemable-type';
import { RedeemablesType } from '../models/redeemables-type';
import Coin from './ExploreScreen/Coin';
import Key from './ExploreScreen/Key';
import NotAtPark from './ExploreScreen/NotAtPark';
import NotSignedIn from './ExploreScreen/NotSignedIn';
import PermissionsNotGranted from './ExploreScreen/PermissionsNotGranted';
import Pumpkin from './ExploreScreen/Pumpkin';

dayjs.extend(require('dayjs/plugin/isBetween'));

export default function ExploreScreen() {
  const [redeemables, setRedeemables] = useState<RedeemablesType | null>();
  const [activeRedeemable, setActiveRedeemable] = useState<
    RedeemableType | undefined
  >();
  const { inventory, refreshUser, user } = useContext(AuthContext);
  const { playMusic } = useContext(MusicContext);
  const { parkLoaded, location, park, permissionGranted } =
    useContext(LocationContext);
  const { theme } = useContext(ThemeContext);

  useFocusEffect(
    useCallback(() => {
      playMusic(require('../../assets/sounds/music/track5.mp3'));
    }, [])
  );

  const getRedeemables = async () => {
    setActiveRedeemable(undefined);
    setRedeemables(await currentRedeemables());
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
    if (!park || !location?.latitude || !location?.longitude || !redeemables) {
      return;
    }

    setActiveRedeemable(await checkForRedeemable());
  }, [park?.id, location?.latitude, location?.longitude, redeemables]);

  return (
    <Wrapper>
      <Topbar
        parkCoin={user && park?.coin_url}
        showCoins={!!user}
        showKeys={!!user}
        showPumpkins={!!user && theme?.show_pumpkin_currency}
        parkCoins={user && park?.park_coins_count}
      />
      {user && (
        <>
          {!permissionGranted && <PermissionsNotGranted />}
          {parkLoaded && !park && <NotAtPark />}
        </>
      )}
      {!user && <NotSignedIn />}
      {park && redeemables && (
        <>
          <View
            style={{
              position: 'absolute',
              left: 16,
              bottom: 32,
              zIndex: 10,
            }}
          >
            {theme && theme.store && (
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
                    contentFit="contain"
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
                    contentFit="contain"
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
                  contentFit="contain"
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
        <Map>
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
                  contentFit="contain"
                />
                <Callout>
                  <Text
                    style={{
                      textAlign: 'center',
                    }}
                  >
                    {task.name}
                  </Text>
                </Callout>
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
                  contentFit="contain"
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
        </Map>
      </View>
    </Wrapper>
  );
}
