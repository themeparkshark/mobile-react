import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useContext, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getLiveEvents from '../api/endpoints/live-events/all';
import getThreads from '../api/endpoints/threads/getThreads';
import Button from '../components/Button';
import CreateThreadModal from '../components/CreateThreadModal';
import LiveEvents from '../components/LiveEvents';
import Loading from '../components/Loading';
import PlayerButtons from '../components/PlayerButtons';
import SortByDropdown, { SortOption } from '../components/SortByDropdown';
import Thread from '../components/Thread';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';
import usePermissions from '../hooks/usePermissions';
import { LiveEventType } from '../models/live-event-type';
import { PermissionEnums } from '../models/permission-enums';
import { ThreadType } from '../models/thread-type';

export default function SocialScreen({ navigation }) {
  const [threads, setThreads] = useState<ThreadType[]>([]);
  const [pinnedThreads, setPinnedThreads] = useState<ThreadType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);
  const { labels, urls } = useCrumbs();
  const options = [
    {
      label: labels.hot,
      value: 'hottest',
    },
    {
      label: labels.new,
      value: 'latest',
    },
    {
      label: labels.most_comments,
      value: 'most_comments',
    },
    {
      label: labels.most_reactions,
      value: 'most_reactions',
    },
  ];
  const [filter, setFilter] = useState<SortOption>(options[0]);
  const { checkPermission } = usePermissions();
  const { player } = useContext(AuthContext);
  const [liveEvents, setLiveEvents] = useState<LiveEventType[]>([]);

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
    setLiveEvents(await getLiveEvents());
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
      <Topbar>
        <TopbarColumn stretch={false}>
          <CreateThreadModal />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Social</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <Button onPress={() => {}}>
            <Image
              style={{
                width: 35,
                height: 35,
                alignSelf: 'center',
              }}
              contentFit="contain"
              source={require('../../assets/images/faq.png')}
            />
          </Button>
        </TopbarColumn>
      </Topbar>
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
            contentContainerStyle={{
              paddingBottom: 64,
            }}
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
                    <PlayerButtons
                      buttons={[
                        {
                          image: require('../../assets/images/screens/explore/base.png'),
                          onPress: () => {
                            WebBrowser.openBrowserAsync(urls.instagram);
                          },
                          text: 'Instagram',
                        },
                        {
                          image: require('../../assets/images/screens/social/membership.png'),
                          onPress: () => {
                            if (
                              checkPermission(PermissionEnums.BecomeAMember)
                            ) {
                              navigation.navigate('Membership');
                            }
                          },
                          text: 'Member',
                          permission: PermissionEnums.BecomeAMember,
                          show:
                            !player || Boolean(player && !player.is_subscribed),
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
                          image: require('../../assets/images/screens/social/redeem.png'),
                          onPress: () => {
                            if (
                              checkPermission(PermissionEnums.RedeemCoinCodes)
                            ) {
                              navigation.navigate('RedeemCoinCode');
                            }
                          },
                          text: 'Redeem',
                          permission: PermissionEnums.RedeemCoinCodes,
                        },
                        {
                          image: require('../../assets/images/screens/explore/base.png'),
                          onPress: () => {
                            WebBrowser.openBrowserAsync(urls.tiktok);
                          },
                          text: 'TikTok',
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
                          image: require('../../assets/images/screens/explore/base.png'),
                          onPress: () => {
                            WebBrowser.openBrowserAsync(urls.x);
                          },
                          text: 'X',
                        },
                      ]}
                    />
                  </View>
                  {liveEvents.length > 0 && (
                    <LiveEvents liveEvents={liveEvents} />
                  )}
                  <SortByDropdown
                    activeOption={filter}
                    options={options}
                    onChange={async (activeOption) => {
                      setThreads([]);
                      setFilter(activeOption);
                    }}
                    title={labels.sort_threads}
                    resource={labels.threads}
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
