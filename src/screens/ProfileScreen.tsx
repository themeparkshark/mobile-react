import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
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
import Topbar from '../components/Topbar';
import UserButtons from '../components/UserButtons';
import Verified from '../components/Verified';
import VisitedParks from '../components/VisitedParks';
import Wrapper from '../components/Wrapper';
import YellowButton from '../components/YellowButton';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { FriendContext } from '../context/FriendProvider';
import { MusicContext } from '../context/MusicProvider';
import { NotificationContext } from '../context/NotificationProvider';
import { ButtonType } from '../models/button-type';
import { ParkType } from '../models/park-type';
import { StoreType } from '../models/store-type';
import * as RootNavigation from '../RootNavigation';

export default function ProfileScreen() {
  const [parks, setParks] = useState<ParkType[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [buttons, setButtons] = useState<ButtonType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { user, inventory, setInventory } = useContext(AuthContext);
  const { friends, refreshFriends } = useContext(FriendContext);
  const { notificationCount } = useContext(NotificationContext);
  const { playMusic } = useContext(MusicContext);

  useFocusEffect(
    useCallback(() => {
      playMusic(require('../../assets/sounds/music/track5.mp3'));
    }, [])
  );

  useAsyncEffect(async () => {
    setParks(await getParks(user.id));
    setStores(await getStores());
    setInventory(await getInventory());
    await refreshFriends();

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
          text: 'Pin Packs',
          show: true,
        },
        ...stores.map((store) => {
          return {
            image: store.icon_url,
            onPress: () => {
              RootNavigation.navigate('Store', {
                store: store.id,
              });
            },
            text: store.name,
            show: true,
          };
        }),
      ]);
    }
  }, [stores]);

  return (
    user && (
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
                <Button
                  onPress={() => {
                    RootNavigation.navigate('Inventory');
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
                </Button>
              </ImageBackground>
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
                {user.verified_at && <Verified />}
                <Heading text="Statistics" />
                <Stats user={user} />
                <Heading text="Your Friends" />
                {friends && friends.length > 0 && (
                  <>
                    <View
                      style={{
                        minHeight: 200,
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
                              onRemove={async () => {
                                await refreshFriends();
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
                        text="View all friends"
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
                      You don't have any friends yet.
                    </Text>
                    <View style={{ alignItems: 'center', marginTop: 32, width: 190, marginLeft: 'auto', marginRight: 'auto' }}>
                      <YellowButton
                        onPress={() => {
                          RootNavigation.navigate('Friends');
                        }}
                        text="Find friends"
                      />
                    </View>
                  </>
                )}
                <Heading text="Your Parks" />
                <VisitedParks parks={parks} user={user} />
              </View>
            </View>
          </ScrollView>
        )}
      </Wrapper>
    )
  );
}
