import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import recordActivity from '../api/endpoints/activities/create';
import getInventory from '../api/endpoints/me/inventory';
import getParks from '../api/endpoints/me/visited-parks';
import getStores from '../api/endpoints/stores/stores';
import Activity from '../components/Activity';
import Button from '../components/Button';
import Experience from '../components/Experience';
import FriendsList from '../components/FriendsList';
import Heading from '../components/Heading';
import Loading from '../components/Loading';
import Playercard from '../components/Playercard';
import Topbar from '../components/Topbar';
import Verified from '../components/Verified';
import VisitedParks from '../components/VisitedParks';
import Wrapper from '../components/Wrapper';
import YellowButton from '../components/YellowButton';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { FriendContext } from '../context/FriendProvider';
import { NotificationContext } from '../context/NotificationProvider';
import { ParkType } from '../models/park-type';
import { StoreType } from '../models/store-type';
import * as RootNavigation from '../RootNavigation';

interface ButtonType {
  readonly image: any;
  readonly screen: () => void;
  readonly text: string;
}

export default function NewsScreen({ navigation }) {
  const [parks, setParks] = useState<ParkType[]>([]);
  const [stores, setStores] = useState<StoreType[]>([]);
  const [buttons, setButtons] = useState<ButtonType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { user, setInventory } = useContext(AuthContext);
  const { friends, refreshFriends } = useContext(FriendContext);
  const { notificationCount } = useContext(NotificationContext);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Profile screen.');
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
          screen: () => {
            RootNavigation.navigate('PinCollections');
          },
          text: 'Pin Packs',
        },
        ...stores.map((store) => {
          return {
            image: store.icon_url,
            screen: () => {
              RootNavigation.navigate('Store', {
                store: store.id,
              });
            },
            text: store.name,
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
                  width: 50,
                  height: 50,
                  alignSelf: 'center',
                }}
                contentFit="contain"
                source={require('../../assets/images/screens/profile/settings.png')}
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
                  width: 50,
                  height: 50,
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
                style={{
                  height: 315,
                  overflow: 'hidden',
                  position: 'relative',
                }}
                onPress={() => navigation.navigate('Inventory')}
              >
                <Playercard
                  inventory={user.inventory}
                  style={{
                    position: 'absolute',
                    width: Dimensions.get('window').width,
                    height: 455,
                    marginTop: -55,
                  }}
                />
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
                <View
                  style={{
                    paddingTop: 24,
                    flexDirection: 'row',
                    justifyContent: 'center',
                  }}
                >
                  {buttons?.map((button, index) => {
                    return (
                      <Pressable
                        key={index}
                        style={{
                          paddingLeft: 16,
                          paddingRight: 16,
                        }}
                      >
                        <Button onPress={button.screen}>
                          <Image
                            source={button.image}
                            style={{
                              width: 80,
                              height: 80,
                              marginLeft: 'auto',
                              marginRight: 'auto',
                            }}
                            contentFit="contain"
                          />
                        </Button>
                        <Text
                          style={{
                            paddingTop: 8,
                            textAlign: 'center',
                            fontFamily: 'Knockout',
                            textTransform: 'uppercase',
                            fontSize: 20,
                          }}
                        >
                          {button.text}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {user.verified_at && <Verified />}
                <Heading text="Total Activity" />
                <Activity user={user} />
                <Heading text="Your Friends" />
                {friends && friends.length > 0 && (
                  <>
                    <FriendsList
                      onSuccess={async () => {
                        await refreshFriends();
                      }}
                      users={friends}
                    />
                    <View style={{ alignItems: 'center', marginTop: 32 }}>
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
                    <View style={{ alignItems: 'center', marginTop: 32 }}>
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
