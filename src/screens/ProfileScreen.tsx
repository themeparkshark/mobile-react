import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import getFriends from '../api/endpoints/me/friends';
import getInventory from '../api/endpoints/me/inventory';
import getParks from '../api/endpoints/me/visited-parks';
import getStores from '../api/endpoints/stores/stores';
import Button from '../components/Button';
import Experience from '../components/Experience';
import FriendUser from '../components/FriendUser';
import Heading from '../components/Heading';
import Loading from '../components/Loading';
import Playercard from '../components/Playercard';
import Stats from '../components/Stats';
import Subscribed from '../components/Subscribed';
import Topbar from '../components/Topbar';
import UserButtons from '../components/UserButtons';
import Verified from '../components/Verified';
import VisitedParks from '../components/VisitedParks';
import Wrapper from '../components/Wrapper';
import YellowButton from '../components/YellowButton';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { MusicContext } from '../context/MusicProvider';
import { NotificationContext } from '../context/NotificationProvider';
import useCrumbs from '../hooks/useCrumbs';
import { ButtonType } from '../models/button-type';
import { ParkType } from '../models/park-type';
import { PermissionEnums } from '../models/permission-enums';
import { StoreType } from '../models/store-type';
import { UserType } from '../models/user-type';

export default function ProfileScreen() {
  const [parks, setParks] = useState<ParkType[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [buttons, setButtons] = useState<ButtonType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { user, inventory, setInventory } = useContext(AuthContext);
  const [friends, setFriends] = useState<UserType[]>([]);
  const { refreshNotificationCount, notificationCount } =
    useContext(NotificationContext);
  const { warnings, labels } = useCrumbs();

  const requestFriends = () => {
    getFriends(1, 3).then((response) => setFriends(response));
  };

  useFocusEffect(
    useCallback(() => {
      requestFriends();
      refreshNotificationCount();
    }, [])
  );

  useAsyncEffect(async () => {
    setParks(await getParks(user.id));
    setStores(await getStores());
    setInventory(await getInventory());
    requestFriends();

    setLoading(false);
  }, []);

  useEffect(() => {
    if (stores) {
      setButtons([
        {
          image: require('../../assets/images/screens/profile/pin_collections.png'),
          onPress: () => {
            RootNavigation.navigate('PinCollections');
          },
          text: labels.pin_packs,
        },
        ...stores.map((store) => {
          return {
            image: store.icon_url,
            onPress: () => {
              if (!store.is_secret_store) {
                RootNavigation.navigate('Store', {
                  store: store.id,
                });
                return;
              }

              if (user?.is_subscribed) {
                RootNavigation.navigate('Store', {
                  store: store.id,
                });
              } else {
                RootNavigation.navigate('Membership');
              }
            },
            text: store.name,
            permission:
              user && !user.is_subscribed && store.is_secret_store
                ? PermissionEnums.ViewSecretStore
                : undefined,
          };
        }),
      ]);
    }
  }, [stores]);

  if (!user) {
    return <></>;
  }

  return (
    <Wrapper>
      <Topbar
        text={user.screen_name}
        leftButton={
          <Button
            onPress={() => {
              RootNavigation.navigate('Notifications');
            }}
            showRedCircle={!!notificationCount}
          >
            <Image
              style={{
                width: 35,
                height: 35,
                alignSelf: 'center',
              }}
              contentFit="contain"
              source={require('../../assets/images/screens/profile/notifications.png')}
            />
          </Button>
        }
        rightButton={
          <Button
            onPress={() => {
              RootNavigation.navigate('Settings');
            }}
          >
            <Image
              style={{
                width: 35,
                height: 35,
                alignSelf: 'center',
              }}
              contentFit="contain"
              source={require('../../assets/images/screens/profile/settings.png')}
            />
          </Button>
        }
      />
      {loading && <Loading />}
      {!loading && user && (
        <ScrollView
          style={{
            flex: 1,
            marginTop: -8,
          }}
        >
          <View
            style={{
              paddingBottom: 32,
            }}
          >
            <Pressable
              onPress={() => {
                RootNavigation.navigate('Inventory');
              }}
            >
              <ImageBackground
                source={{
                  uri: inventory?.background_item.paper_url,
                }}
                style={{
                  height: 315,
                  overflow: 'hidden',
                  position: 'relative',
                }}
              >
                <Playercard
                  showBackground={false}
                  inventory={user.inventory}
                  style={{
                    position: 'absolute',
                    width: Dimensions.get('window').width,
                    height: 455,
                    marginTop: -55,
                  }}
                />
                <View
                  style={{
                    borderTopRightRadius: 6,
                    backgroundColor: 'rgba(0, 0, 0, .5)',
                    paddingLeft: 8,
                    paddingRight: 8,
                    paddingTop: 4,
                    paddingBottom: 4,
                    flexDirection: 'row',
                    alignItems: 'center',
                    position: 'absolute',
                    bottom: 0,
                  }}
                >
                  <Image
                    source={require('../../assets/images/screens/profile/edit.png')}
                    contentFit="contain"
                    style={{
                      width: 25,
                      height: 25,
                      marginRight: 8,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: 'Shark',
                      textTransform: 'uppercase',
                      color: 'white',
                      fontSize: 24,
                      textShadowColor: 'rgba(0, 0, 0, .5)',
                      textShadowOffset: {
                        width: 1,
                        height: 1,
                      },
                      textShadowRadius: 0,
                      textAlign: 'center',
                    }}
                  >
                    {labels.edit}
                  </Text>
                </View>
              </ImageBackground>
            </Pressable>
            <View
              style={{
                borderTopWidth: 5,
                borderTopColor: config.primary,
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 24,
              }}
            >
              <Experience user={user} />
              <UserButtons buttons={buttons} />
              {user.is_subscribed && <Subscribed />}
              {user.verified_at && <Verified />}
              <Heading text={labels.your_statistics} />
              <Stats user={user} />
              <Heading text={labels.your_friends} />
              {friends && friends.length > 0 && (
                <>
                  <View
                    style={{
                      height: friends.length * 80,
                    }}
                  >
                    <FlashList
                      contentContainerStyle={{ paddingBottom: 8 }}
                      data={friends}
                      keyExtractor={(user) => user.id.toString()}
                      renderItem={({ item }) => {
                        return (
                          <FriendUser
                            user={item}
                            isFriend
                            onRemove={() => {
                              requestFriends();
                            }}
                          />
                        );
                      }}
                      estimatedItemSize={80}
                    />
                  </View>
                  <View
                    style={{
                      alignItems: 'center',
                      marginTop: 32,
                      width: 190,
                      marginLeft: 'auto',
                      marginRight: 'auto',
                    }}
                  >
                    <YellowButton
                      onPress={() => {
                        RootNavigation.navigate('Friends');
                      }}
                      text={labels.view_all_friends}
                    />
                  </View>
                </>
              )}
              {friends && friends.length === 0 && (
                <>
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 20,
                      textAlign: 'center',
                      paddingTop: 16,
                    }}
                  >
                    {warnings.no_friends}
                  </Text>
                  <View
                    style={{
                      alignItems: 'center',
                      marginTop: 32,
                      width: 190,
                      marginLeft: 'auto',
                      marginRight: 'auto',
                    }}
                  >
                    <YellowButton
                      onPress={() => {
                        RootNavigation.navigate('Friends');
                      }}
                      text={labels.find_friends}
                    />
                  </View>
                </>
              )}
              <Heading text={labels.your_parks} />
              <VisitedParks parks={parks} user={user} />
            </View>
          </View>
        </ScrollView>
      )}
    </Wrapper>
  );
}
