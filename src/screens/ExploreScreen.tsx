import { useFocusEffect } from '@react-navigation/native';
import dayjs from 'dayjs';
import { Image } from 'expo-image';
import React, { useCallback, useContext, useState, Suspense } from 'react';
import { Text, TouchableOpacity, View, ActivityIndicator } from 'react-native';
import { Callout, Marker } from 'react-native-maps';
import { useAsyncEffect } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import currentRedeemables from '../api/endpoints/me/current-redeemables';
// Lazy load ARView to prevent camera module crash
const ARView = React.lazy(() => import('../components/ARView'));
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Map from '../components/Map';
import RedeemModal from '../components/RedeemModal';
import PrepItemRedeemModal from '../components/PrepItemRedeemModal';
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
import { PrepItemType } from '../models/prep-item-type';
import Coin from './ExploreScreen/Coin';
import Key from './ExploreScreen/Key';
import HomeExplore from './ExploreScreen/HomeExplore';
import NotSignedIn from './ExploreScreen/NotSignedIn';
import PermissionsNotGranted from './ExploreScreen/PermissionsNotGranted';
import Redeemable from './ExploreScreen/Redeemable';

dayjs.extend(require('dayjs/plugin/isBetween'));

export default function ExploreScreen() {
  const [redeemables, setRedeemables] = useState<RedeemablesType | null>();
  const [activeRedeemable, setActiveRedeemable] = useState<
    CurrentRedeemableType | undefined
  >();
  const [failedTaskIds, setFailedTaskIds] = useState<Set<number>>(new Set());
  // Home mode state for prep items
  const [activePrepItem, setActivePrepItem] = useState<PrepItemType | null>(null);
  const [activePrepItemPivotId, setActivePrepItemPivotId] = useState<number | null>(null);
  const [showPrepItemModal, setShowPrepItemModal] = useState(false);
  const [arMode, setArMode] = useState(false);
  
  const { refreshPlayer, player } = useContext(AuthContext);
  const { parkLoaded, location, park, permissionGranted } =
    useContext(LocationContext);
  const { theme } = useContext(ThemeContext);
  const { currencies } = useContext(CurrencyContext);
  
  // Handler for when user approaches a prep item in home mode
  const handlePrepItemNearby = useCallback((prepItem: PrepItemType, pivotId: number) => {
    setActivePrepItem(prepItem);
    setActivePrepItemPivotId(pivotId);
    setShowPrepItemModal(true);
  }, []);

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

    const redeemable = await checkForRedeemable();
    
    // Don't show redeemable if it's a task that was failed locally
    if (redeemable?.type === 'task' && failedTaskIds.has(redeemable.model.id)) {
      setActiveRedeemable(undefined);
      return;
    }
    
    setActiveRedeemable(redeemable);
  }, [park?.id, location?.latitude, location?.longitude, redeemables, failedTaskIds]);

  return (
    <Wrapper>
      <Topbar>
        {player && (
          <>
            {/* Park mode: show park coins */}
            {park && (
              <TopbarColumn>
                <Currency
                  image={park?.coin_url}
                  count={park?.park_coins_count}
                />
              </TopbarColumn>
            )}
            {/* Park mode: theme currency and other currencies */}
            {park && theme?.currency && (
              <TopbarColumn>
                <Currency
                  image={theme.currency.icon_url}
                  count={player[theme.currency.name.toLowerCase()]}
                />
              </TopbarColumn>
            )}
            {park && currencies.map((currency) => (
              <TopbarColumn key={currency.id}>
                <Currency
                  image={currency.icon_url}
                  count={player[currency.name.toLowerCase()]}
                />
              </TopbarColumn>
            ))}
            {/* TRAVEL MODE: Coins | TRAVEL MODE | Keys */}
            {!park && (
              <>
                {/* Left: First currency (coins) */}
                <TopbarColumn>
                  {currencies[0] && (
                    <Currency
                      image={currencies[0].icon_url}
                      count={player[currencies[0].name.toLowerCase()]}
                    />
                  )}
                </TopbarColumn>
                {/* Center: TRAVEL MODE */}
                <TopbarColumn>
                  <Text style={{
                    fontSize: 16,
                    color: 'white',
                    fontFamily: 'Shark',
                    textTransform: 'uppercase',
                    letterSpacing: 2,
                    textShadowColor: 'rgba(0, 0, 0, .5)',
                    textShadowOffset: { width: 2, height: 2 },
                    textShadowRadius: 0,
                    textAlign: 'center',
                  }}>Travel Mode</Text>
                </TopbarColumn>
                {/* Right: Second currency (keys) */}
                <TopbarColumn>
                  {currencies[1] && (
                    <Currency
                      image={currencies[1].icon_url}
                      count={player[currencies[1].name.toLowerCase()]}
                    />
                  )}
                </TopbarColumn>
              </>
            )}
            {/* V2: Show tickets if player has any */}
            {(player.tickets ?? 0) > 0 && (
              <TopbarColumn>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 24, marginRight: 4 }}>🎟️</Text>
                  <Text style={{
                    fontSize: 24,
                    color: 'white',
                    fontFamily: 'Shark',
                    textShadowColor: 'rgba(0, 0, 0, .5)',
                    textShadowOffset: { width: 2, height: 2 },
                    textShadowRadius: 0,
                  }}>{player.tickets}</Text>
                </View>
              </TopbarColumn>
            )}
          </>
        )}
      </Topbar>
      {player && (
        <>
          {!permissionGranted && <PermissionsNotGranted />}
          {/* Home Mode: Show prep items map instead of "Not at Park" message */}
          {parkLoaded && !park && permissionGranted && (
            <HomeExplore onPrepItemNearby={handlePrepItemNearby} />
          )}
        </>
      )}
      {!player && <NotSignedIn />}
      
      {/* Prep Item Redeem Modal (Home Mode) */}
      <PrepItemRedeemModal
        visible={showPrepItemModal}
        prepItem={activePrepItem}
        pivotId={activePrepItemPivotId}
        onClose={() => {
          setShowPrepItemModal(false);
          setActivePrepItem(null);
          setActivePrepItemPivotId(null);
        }}
        onCollected={() => {
          // Modal will be closed by onClose
        }}
      />
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
              onTaskFailed={(taskId) => {
                // Track failed task so it doesn't reappear
                setFailedTaskIds((prev) => new Set([...prev, taskId]));
                // Remove failed task from local state immediately
                setRedeemables((prev) => {
                  if (!prev) return prev;
                  return {
                    ...prev,
                    tasks: prev.tasks.filter((t) => t.id !== taskId),
                  };
                });
                setActiveRedeemable(undefined);
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
            {player?.inventory && (
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
      {/* AR / Map Toggle Button */}
      {park && redeemables && (
        <TouchableOpacity
          onPress={() => setArMode((prev) => !prev)}
          style={{
            position: 'absolute',
            top: 95,
            right: 16,
            zIndex: 20,
            backgroundColor: 'rgba(0,0,0,0.7)',
            borderRadius: 12,
            paddingHorizontal: 12,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Text style={{ color: '#fff', fontSize: 13, fontFamily: 'Shark' }}>
            {arMode ? 'MAP' : 'AR'}
          </Text>
        </TouchableOpacity>
      )}
      {/* Park Mode View - Map or AR */}
      {park && arMode && redeemables && (
        <View style={{ flex: 1, marginTop: -8 }}>
          <Suspense fallback={<View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator size="large" /></View>}>
            <ARView redeemables={redeemables} onRefresh={() => getRedeemables()} />
          </Suspense>
        </View>
      )}
      {park && !arMode && (
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
      )}
    </Wrapper>
  );
}
