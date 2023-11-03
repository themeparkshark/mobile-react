import { FlashList } from '@shopify/flash-list';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useContext, useState } from 'react';
import { Image, RefreshControl, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getThreads from '../api/endpoints/threads/getThreads';
import Button from '../components/Button';
import CreateThreadModal from '../components/CreateThreadModal';
import Loading from '../components/Loading';
import SortByDropdown, { SortOption } from '../components/SortByDropdown';
import Thread from '../components/Thread';
import Topbar from '../components/Topbar';
import UserButtons from '../components/UserButtons';
import Wrapper from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';
import usePermissions from '../hooks/usePermissions';
import { PermissionEnums } from '../models/permission-enums';
import { ThreadType } from '../models/thread-type';

const options = [
  {
    label: 'Hot',
    value: 'hottest',
  },
  {
    label: 'New',
    value: 'latest',
  },
];

export default function SocialScreen({ navigation }) {
  const [threads, setThreads] = useState<ThreadType[]>([]);
  const [pinnedThreads, setPinnedThreads] = useState<ThreadType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const [filter, setFilter] = useState<SortOption>(options[0]);
  const { urls } = useCrumbs();
  const { checkPermission } = usePermissions();
  const { user } = useContext(AuthContext);

  const fetchPinnedThreads = async () => {
    setPinnedThreads(
      await getThreads(1, {
        pinned: true,
      })
    );
  };

  const fetchThreads = async (page: number) => {
    const response = await getThreads(page, {
      sort: filter.value,
    });
    setThreads((prevState) => {
      return [...prevState, ...response];
    });
  };

  useAsyncEffect(async () => {
    if (loading) {
      return;
    }

    await fetchThreads(1);
    setPage(1);
  }, [filter]);

  useAsyncEffect(async () => {
    await fetchPinnedThreads();
    await fetchThreads(1);
    setPage(1);
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setThreads([]);
    setPinnedThreads([]);
    await fetchThreads(1);
    await fetchPinnedThreads();
    setRefreshing(false);
    setPage(1);
  }, []);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchThreads(page);
    }
  }, [page]);

  return (
    <Wrapper>
      <Topbar
        text="Social"
        leftButton={
          <CreateThreadModal
            onSubmit={async () => {
              setPage(1);
              setThreads([]);
              await fetchThreads(1);
            }}
          />
        }
        rightButton={
          <Button onPress={() => {}}>
            <Image
              style={{
                width: 35,
                height: 35,
                alignSelf: 'center',
              }}
              resizeMode="contain"
              source={require('../../assets/images/faq.png')}
            />
          </Button>
        }
      />
      {loading && <Loading />}
      {!loading && (
        <View
          style={{
            marginTop: -8,
            flex: 1,
          }}
        >
          <FlashList
            data={threads}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
            ListHeaderComponent={
              <>
                <View
                  style={{
                    paddingLeft: 16,
                    paddingRight: 16,
                  }}
                >
                  <View
                    style={{
                      marginBottom: 32,
                    }}
                  >
                    <UserButtons
                      buttons={[
                        {
                          image: require('../../assets/images/screens/social/membership.png'),
                          onPress: () => {
                            if (
                              checkPermission(PermissionEnums.BecomeAMember)
                            ) {
                              navigation.navigate('Membership');
                            }
                          },
                          text: 'Membership',
                          permission: PermissionEnums.BecomeAMember,
                          show: Boolean(user && !user.is_subscribed),
                        },
                        {
                          image: require('../../assets/images/screens/social/merch.png'),
                          onPress: () => {
                            WebBrowser.openBrowserAsync(urls.shop);
                          },
                          text: 'Merch',
                        },
                        {
                          image: require('../../assets/images/screens/social/pin_swaps.png'),
                          onPress: () => {
                            if (checkPermission(PermissionEnums.TradePins)) {
                              navigation.navigate('PinSwaps');
                            }
                          },
                          text: 'Pin Trading',
                          permission: PermissionEnums.TradePins,
                        },
                        {
                          image: require('../../assets/images/screens/social/social_media.png'),
                          onPress: () => {
                            if (checkPermission(PermissionEnums.WatchContent)) {
                              navigation.navigate('Watch');
                            }
                          },
                          text: 'Watch',
                          permission: PermissionEnums.WatchContent,
                        },
                        {
                          image: require('../../assets/images/screens/social/arcade.png'),
                          onPress: () => {},
                          text: 'Arcade',
                          disabled: true,
                          permission: PermissionEnums.ViewArcade,
                        },
                      ]}
                    />
                  </View>
                  <SortByDropdown
                    activeOption={filter}
                    options={options}
                    onChange={async (activeOption) => {
                      setThreads([]);
                      setFilter(activeOption);
                    }}
                    title="Sort posts by"
                  />
                </View>
                <View>
                  {pinnedThreads.map((pinnedThread) => (
                    <View
                      key={pinnedThread.id}
                      style={{
                        paddingTop: 16,
                      }}
                    >
                      <Thread thread={pinnedThread} />
                    </View>
                  ))}
                </View>
              </>
            }
            ListFooterComponentStyle={{
              height: 64,
            }}
            renderItem={({ item }) => (
              <View
                key={item.id}
                style={{
                  paddingTop: 8,
                }}
              >
                <Thread thread={item} />
              </View>
            )}
            estimatedItemSize={100}
            keyExtractor={(item) => item.id.toString()}
            onEndReached={() => {
              setPage((prevState) => prevState + 1);
            }}
          />
        </View>
      )}
    </Wrapper>
  );
}
