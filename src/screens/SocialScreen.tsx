/**
 * Shark Social: the community feed.
 *
 * One obvious action at the top ("Share your park day!"), one row of tabs
 * (Hot, New, Friends, my Team), then posts a kid can react to with one tap.
 * The old screen put four shop and trading buttons on top, stacked two filter
 * rows, and hid posting behind a small + that opened a broken sheet.
 * Those shortcuts now live behind the chest button in the top bar.
 */
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import Modal from 'react-native-modal';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchFeed, fetchPinned } from '../api/endpoints/social';
import Avatar from '../components/Avatar';
import PlayerButtons from '../components/PlayerButtons';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { isTeam, TEAMS } from '../constants/teams';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import useCrumbs from '../hooks/useCrumbs';
import usePermissions from '../hooks/usePermissions';
import { PermissionEnums } from '../models/permission-enums';
import type { ThreadType } from '../models/thread-type';
import * as RootNavigation from '../RootNavigation';
import { BRAND, GameIcon, SharkLoader } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import Composer from './threads/Composer';
import PostMenu, { type MenuTarget } from './threads/PostMenu';
import SocialHelp from './threads/SocialHelp';
import ThreadCard from './threads/ThreadCard';
import { applySocialEvent, emitSocial, onSocial } from './threads/socialEvents';
import { COMPOSE_ART, PressScale, WATER } from './threads/socialLook';
import { DEFAULT_PROMPT, mergePage, topicFor, type FeedTab, type TopicKey } from './threads/socialModel';

const TAB_SOUND = require('../../assets/sounds/tap.mp3');

type Status = 'loading' | 'ready' | 'error';

export default function SocialScreen({ navigation }: { navigation: { navigate: (screen: string, params?: object) => void; addListener?: (event: string, cb: () => void) => () => void } }) {
  const { player } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);
  const { checkPermission } = usePermissions();
  const { urls } = useCrumbs();
  const reduced = useUiReducedMotion();
  const insets = useSafeAreaInsets();

  const playerTeam = (player as { team?: { team?: string } } | null)?.team?.team;
  const team = isTeam(playerTeam) ? TEAMS[playerTeam] : null;

  const [tab, setTab] = useState<FeedTab>('hottest');
  const [topic, setTopic] = useState<TopicKey | null>(null);
  const [threads, setThreads] = useState<ThreadType[]>([]);
  const [pinned, setPinned] = useState<ThreadType[]>([]);
  const [status, setStatus] = useState<Status>('loading');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [composer, setComposer] = useState<{ open: boolean; editing: ThreadType | null }>({ open: false, editing: null });
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [menuThread, setMenuThread] = useState<ThreadType | null>(null);
  const [shortcuts, setShortcuts] = useState(false);
  const [freshId, setFreshId] = useState<number | null>(null);
  const listRef = useRef<FlashList<ThreadType>>(null);
  const request = useRef(0);

  const load = useCallback(async (nextPage: number, mode: 'replace' | 'append' | 'refresh') => {
    const id = ++request.current;
    if (mode === 'append') setLoadingMore(true);
    try {
      const [feed, pins] = await Promise.all([
        fetchFeed(nextPage, tab, { team: playerTeam ?? null, topic }),
        nextPage === 1 && (tab === 'hottest' || tab === 'latest') && !topic ? fetchPinned() : Promise.resolve(null),
      ]);
      if (id !== request.current) return;
      if (pins) setPinned(pins);
      else if (nextPage === 1) setPinned([]);
      setThreads((current) => mergePage(current, feed.data, nextPage));
      setHasMore(feed.hasMore);
      setPage(nextPage);
      setStatus('ready');
    } catch {
      if (id !== request.current) return;
      if (nextPage === 1 && mode !== 'refresh') setStatus('error');
    } finally {
      if (id === request.current) {
        setLoadingMore(false);
        setRefreshing(false);
      }
    }
  }, [tab, topic, playerTeam]);

  // A new tab or topic starts fresh (and cancels any slower request in flight).
  useEffect(() => {
    setStatus('loading');
    setThreads([]);
    setHasMore(false);
    void load(1, 'replace');
  }, [load]);

  // Changes made on the post screen land here without a refetch.
  useEffect(() => onSocial((event) => {
    setThreads((current) => applySocialEvent(current, event));
    setPinned((current) => applySocialEvent(current, event));
  }), []);

  const onRefresh = () => {
    setRefreshing(true);
    void load(1, 'refresh');
  };

  const onEndReached = () => {
    if (!hasMore || loadingMore || status !== 'ready') return;
    void load(page + 1, 'append');
  };

  const pickTab = (next: FeedTab) => {
    if (next === tab) {
      listRef.current?.scrollToOffset({ offset: 0, animated: !reduced });
      return;
    }
    playSound(TAB_SOUND, { volume: 0.45 });
    setTab(next);
  };

  const openThread = useCallback((thread: ThreadType) => {
    navigation.navigate('Thread', { thread: thread.id, preview: thread });
  }, [navigation]);

  const openMenu = useCallback((thread: ThreadType) => {
    setMenuThread(thread);
    setMenu({
      kind: 'thread',
      id: thread.id,
      authorId: thread.player?.id ?? null,
      authorName: thread.player?.screen_name ?? 'this player',
      mine: thread.player?.id === player?.id,
    });
  }, [player?.id]);

  const openComposer = () => {
    if (!player) return;
    if (!checkPermission(PermissionEnums.CreateThreads)) return;
    setComposer({ open: true, editing: null });
  };

  const onPosted = (thread: ThreadType, edited: boolean) => {
    setComposer({ open: false, editing: null });
    if (edited) {
      emitSocial({ type: 'thread-updated', thread });
      return;
    }
    // Show it where the kid will look: top of the feed, glowing gold.
    const fits = (thread.team ? tab === 'team' : tab !== 'team' && tab !== 'friends') && (!topic || thread.topic === topic);
    if (!fits) {
      setTab(thread.team ? 'team' : 'latest');
      setTopic(null);
    }
    setThreads((current) => [thread, ...current.filter((item) => item.id !== thread.id)]);
    setFreshId(thread.id);
    setTimeout(() => listRef.current?.scrollToOffset({ offset: 0, animated: !reduced }), 50);
    setTimeout(() => setFreshId(null), 4000);
  };

  const items = useMemo(() => {
    const seen = new Set(pinned.map((item) => item.id));
    return [...pinned, ...threads.filter((item) => !seen.has(item.id))];
  }, [pinned, threads]);

  const tabs: { key: FeedTab; label: string; icon?: 'streak' | 'sparkle' | 'shark'; badge?: number }[] = [
    { key: 'hottest', label: 'Hot', icon: 'streak' },
    { key: 'latest', label: 'New', icon: 'sparkle' },
    { key: 'friends', label: 'Friends', icon: 'shark' },
    ...(team ? [{ key: 'team' as FeedTab, label: 'Team', badge: team.badge }] : []),
  ];
  const topicDef = topicFor(topic);

  const header = (
    <View>
      {player ? (
        <PressScale onPress={openComposer} scaleTo={0.97} haptic="medium" style={styles.compose} accessibilityLabel="Write a post" accessibilityHint="Opens the new post screen">
          <Avatar player={player as ThreadType['player']} size="sm" />
          <View style={styles.composeField}>
            <Text style={styles.composeText} numberOfLines={1}>{DEFAULT_PROMPT}</Text>
          </View>
          <Image source={COMPOSE_ART} style={styles.composeArt} contentFit="contain" />
        </PressScale>
      ) : null}

      <View style={styles.tabs} accessibilityRole="tablist">
        {tabs.map((item) => {
          const on = item.key === tab;
          return (
            <PressScale
              key={item.key}
              onPress={() => pickTab(item.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              accessibilityLabel={item.key === 'team' && team ? `${team.name} posts` : `${item.label} posts`}
              style={[styles.tab, on && styles.tabOn]}
              haptic="light"
            >
              {item.badge ? (
                <Image source={item.badge} style={{ width: 22, height: 22 }} contentFit="contain" />
              ) : item.icon ? (
                <GameIcon name={item.icon} size={22} />
              ) : null}
              <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>{item.label}</Text>
            </PressScale>
          );
        })}
      </View>

      {topicDef && (
        <Animated.View entering={reduced ? undefined : FadeIn} style={styles.filterRow}>
          <PressScale onPress={() => setTopic(null)} style={[styles.filter, { borderColor: topicDef.color, backgroundColor: topicDef.chip }]} accessibilityLabel={`Showing ${topicDef.label} posts. Tap to show all`}>
            <Text style={styles.filterText}>Only {topicDef.label}</Text>
            <GameIcon name="close" size={20} />
          </PressScale>
        </Animated.View>
      )}
    </View>
  );

  const empty = status === 'loading' ? (
    <SharkLoader tone="onBlue" onRetry={() => void load(1, 'replace')} style={styles.state} />
  ) : status === 'error' ? (
    <SharkLoader state="error" tone="onBlue" title="Can't reach Shark Social" message="Check your signal and try again." onRetry={() => { setStatus('loading'); void load(1, 'replace'); }} style={styles.state} />
  ) : tab === 'friends' ? (
    <SharkLoader
      state="empty"
      tone="onBlue"
      title="No friend posts yet"
      message="When your friends post, you'll see it here."
      action={{ label: 'Find friends', icon: 'shark', onPress: () => RootNavigation.navigate('Friends') }}
      style={styles.state}
    />
  ) : (
    <SharkLoader
      state="empty"
      tone="onBlue"
      title={tab === 'team' && team ? `Be the first ${team.name} post!` : 'Be the first to post!'}
      message="Share your park day with the Shark fam."
      action={player ? { label: 'Write a post', icon: 'edit', onPress: openComposer } : undefined}
      style={styles.state}
    />
  );

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <PressScale onPress={() => setShortcuts(true)} accessibilityLabel="More: shop, pin trading, redeem" hitSlop={8}>
            <GameIcon name="chest" size={40} />
          </PressScale>
        </TopbarColumn>
        <TopbarColumn><TopbarText>Social</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false}><SocialHelp /></TopbarColumn>
      </Topbar>

      <View style={styles.body}>
        <Image source={WATER} style={StyleSheet.absoluteFill} contentFit="cover" />
        <FlashList
          ref={listRef}
          data={status === 'ready' ? items : []}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item, index }) => (
            <ThreadCard
              thread={item}
              index={index}
              fresh={item.id === freshId}
              onOpen={openThread}
              onMenu={openMenu}
              onTopic={setTopic}
            />
          )}
          extraData={freshId}
          estimatedItemSize={260}
          ListHeaderComponent={header}
          ListEmptyComponent={empty}
          ListFooterComponent={loadingMore ? <SharkLoader compact tone="onBlue" style={{ marginVertical: 12 }} /> : <View style={{ height: 24 + insets.bottom }} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.6}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={BRAND.white} colors={[BRAND.blueBright]} />}
          contentContainerStyle={{ paddingTop: 12 }}
        />
      </View>

      <Composer
        visible={composer.open}
        editing={composer.editing}
        onClose={() => setComposer({ open: false, editing: null })}
        onPosted={onPosted}
      />

      <PostMenu
        target={menu}
        onClose={() => setMenu(null)}
        onEdit={menuThread ? () => setComposer({ open: true, editing: menuThread }) : undefined}
        onGone={(why, target) => {
          if (why === 'blocked' && target.authorId) emitSocial({ type: 'player-blocked', playerId: target.authorId });
          else emitSocial({ type: 'thread-gone', id: target.id });
        }}
      />

      <Modal
        isVisible={shortcuts}
        onBackdropPress={() => setShortcuts(false)}
        onSwipeComplete={() => setShortcuts(false)}
        swipeDirection="down"
        style={{ margin: 0, justifyContent: 'flex-end' }}
        backdropColor={BRAND.navy}
        backdropOpacity={0.35}
        animationIn={reduced ? 'fadeIn' : 'slideInUp'}
        animationOut={reduced ? 'fadeOut' : 'slideOutDown'}
        useNativeDriverForBackdrop
      >
        <View style={[styles.shortcuts, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.handle} />
          <Text style={styles.shortcutsTitle}>More Shark fun</Text>
          <PlayerButtons
            buttons={[
              {
                image: require('../../assets/images/screens/social/pin_swaps.png'),
                onPress: () => { setShortcuts(false); if (checkPermission(PermissionEnums.TradePins)) navigation.navigate('PinSwaps'); },
                text: 'Pin Trading',
                permission: PermissionEnums.TradePins,
              },
              {
                image: require('../../assets/images/screens/social/redeem.png'),
                onPress: () => { setShortcuts(false); if (checkPermission(PermissionEnums.RedeemCoinCodes)) navigation.navigate('RedeemCoinCode'); },
                text: 'Redeem',
                permission: PermissionEnums.RedeemCoinCodes,
              },
              {
                image: require('../../assets/images/screens/social/merch.png'),
                onPress: () => { setShortcuts(false); void WebBrowser.openBrowserAsync(urls.shop); },
                text: 'Merch',
              },
              {
                image: require('../../assets/images/screens/social/membership.png'),
                onPress: () => { setShortcuts(false); if (checkPermission(PermissionEnums.BecomeAMember)) navigation.navigate('Membership'); },
                text: 'Member',
                permission: PermissionEnums.BecomeAMember,
                show: !player || Boolean(player && !player.is_subscribed),
              },
              {
                image: require('../../assets/images/screens/social/social_media.png'),
                onPress: () => { setShortcuts(false); if (checkPermission(PermissionEnums.WatchContent)) navigation.navigate('Watch'); },
                text: 'Watch',
                permission: PermissionEnums.WatchContent,
              },
            ]}
          />
        </View>
      </Modal>
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, backgroundColor: BRAND.blue },
  compose: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 14,
    marginBottom: 12,
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 6,
    backgroundColor: BRAND.white,
    borderRadius: 999,
    borderWidth: 3,
    borderBottomWidth: 6,
    borderColor: '#0a4f9c',
  },
  composeField: { flex: 1, backgroundColor: '#eef6ff', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10 },
  composeText: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navySoft, marginTop: 3 },
  composeArt: { width: 56, height: 56 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 4,
    gap: 4,
    borderRadius: 999,
    backgroundColor: 'rgba(5,52,110,0.55)',
  },
  tab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, minHeight: 46, borderRadius: 999, paddingHorizontal: 4 },
  tabOn: { backgroundColor: BRAND.gold, borderWidth: 2, borderBottomWidth: 4, borderColor: '#7a3d00' },
  tabText: { fontFamily: 'Shark', fontSize: 16, color: '#cfe6ff', marginTop: 3 },
  tabTextOn: { color: '#7a3d00' },
  filterRow: { flexDirection: 'row', marginHorizontal: 14, marginBottom: 10 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 2, borderRadius: 999, paddingLeft: 14, paddingRight: 6, minHeight: 40 },
  filterText: { fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 3 },
  state: { marginTop: 40, paddingHorizontal: 24 },
  shortcuts: {
    backgroundColor: BRAND.cream,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 3,
    borderBottomWidth: 0,
    borderColor: BRAND.navy,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  handle: { alignSelf: 'center', width: 48, height: 6, borderRadius: 3, backgroundColor: '#d9c99b', marginBottom: 8 },
  shortcutsTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.navy, textAlign: 'center', marginBottom: 6 },
});
