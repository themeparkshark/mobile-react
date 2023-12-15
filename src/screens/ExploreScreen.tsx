import dayjs from 'dayjs';
import { Image } from 'expo-image';
import { useContext, useState } from 'react';
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
import Currency from '../components/Topbar/Currency';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import Wrapper from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import { CurrencyContext } from '../context/CurrencyProvider';
import { LocationContext } from '../context/LocationProvider';
import { ThemeContext } from '../context/ThemeProvider';
import checkForRedeemable from '../helpers/check-for-redeemable';
import { CurrentRedeemableType } from '../models/current-redeemable-type';
import { RedeemablesType } from '../models/redeemables-type';
import Coin from './ExploreScreen/Coin';
import Key from './ExploreScreen/Key';
import NotAtPark from './ExploreScreen/NotAtPark';
import NotSignedIn from './ExploreScreen/NotSignedIn';
import PermissionsNotGranted from './ExploreScreen/PermissionsNotGranted';
import Redeemable from './ExploreScreen/Redeemable';

dayjs.extend(require('dayjs/plugin/isBetween'));

export default function ExploreScreen() {
  const [redeemables, setRedeemables] = useState<RedeemablesType | null>();
  const [activeRedeemable, setActiveRedeemable] = useState<
    CurrentRedeemableType | undefined
  >();
  const { inventory, refreshPlayer, player } = useContext(AuthContext);
  const { parkLoaded, location, park, permissionGranted } =
    useContext(LocationContext);
  const { theme } = useContext(ThemeContext);
  const { currencies } = useContext(CurrencyContext);

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
      <Topbar>
        {player && (
          <>
            {park && (
              <TopbarColumn>
                <Currency
                  image={park?.coin_url}
                  count={park?.park_coins_count}
                />
              </TopbarColumn>
            )}
            {theme?.currency && (
              <TopbarColumn>
                <Currency
                  image={theme.currency.icon_url}
                  count={player[theme.currency.name.toLowerCase()]}
                />
              </TopbarColumn>
            )}
            {currencies.map((currency) => (
              <TopbarColumn key={currency.id}>
                <Currency
                  image={currency.icon_url}
                  count={player[currency.name.toLowerCase()]}
                />
              </TopbarColumn>
            ))}
          </>
        )}
      </Topbar>
      {player && (
        <>
          {!permissionGranted && <PermissionsNotGranted />}
          {parkLoaded && !park && <NotAtPark />}
        </>
      )}
      {!player && <NotSignedIn />}
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
            {park.stores.length > 0 && (
              <View
                style={{
                  marginBottom: 8,
                  rowGap: 8,
                }}
              >
                {park.stores.map((store) => {
                  return (
                    <Button
                      key={store.id}
                      onPress={() => {
                        RootNavigation.navigate('Store', {
                          store: store.id,
                        });
                      }}
                    >
                      <Image
                        style={{
                          width: 70,
                          height: 75,
                        }}
                        source={{
                          uri: store.icon_url,
                        }}
                        contentFit="contain"
                      />
                    </Button>
                  );
                })}
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
                await refreshPlayer();
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
                <Avatar player={player} size="lg" />
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
          {redeemables?.redeemables
            .filter((redeemable) =>
              dayjs().isBetween(
                dayjs(redeemable.active_from),
                dayjs(redeemable.active_to)
              )
            )
            .map((redeemable) => {
              return (
                <Marker
                  key={redeemable.id}
                  coordinate={{
                    latitude: Number(redeemable.latitude),
                    longitude: Number(redeemable.longitude),
                  }}
                >
                  <Redeemable
                    redeemable={redeemable}
                    onExpire={() => getRedeemables()}
                  />
                </Marker>
              );
            })}
        </Map>
      </View>
    </Wrapper>
  );
}
