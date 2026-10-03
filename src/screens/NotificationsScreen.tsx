/**
 * The bell (Social v2): "New" on top, "Earlier" below, each row a coloured
 * picture badge, friend requests answered in place, one "Read all" button.
 *
 * Read state lives here, keyed by id (FlashList recycles rows: a row that kept
 * its own read flag showed old rows as unread). Paging stops at the last page,
 * a failed page offers Try again, and a tap navigates first and marks read in
 * the background.
 */
import { FlashList } from '@shopify/flash-list';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import Reanimated, {
  cancelAnimation, Easing, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { getNotificationsPage } from '../api/endpoints/me/notifications';
import markAllAsRead from '../api/endpoints/me/notifications/markAllAsRead';
import markAsRead from '../api/endpoints/me/notifications/markAsRead';
import deleteNotification from '../api/endpoints/me/notifications/deleteNotification';
import Notification, { NOTIFICATION_ROW_HEIGHT } from '../components/Notification';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import { NotificationContext } from '../context/NotificationProvider';
import { useToast } from '../components/Toast';
import { haptic } from '../gamekit/Haptics';
import { playSfx } from '../gamekit/SFX';
import type { NotificationType } from '../models/notification-type';
import * as RootNavigation from '../RootNavigation';
import { BRAND, FONT, GameIcon, SharkLoader, confirmGame } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { actorOf, isUnread, kindOf, mergePage, resolveRoute, sectionize, type InboxRow } from './social/socialModel';
import { INK, Pill, SectionHeader, SocialBackdrop, SocialError } from './social/SocialKit';
import { useFriendOverrides } from './social/socialStore';

/** Mark-all-read only makes sense when something is unread. */
export function showMarkAllRead(notifications: readonly { read_at?: string | null; id?: string }[], readIds?: ReadonlySet<string>): boolean {
  return notifications.some(n => !n.read_at && !(n.id && readIds?.has(n.id)));
}

const REFOCUS_MS = 20_000;

/** "All caught up": his bell rings twice every few seconds; reduced motion keeps it still. */
function CaughtUp() {
  const reduced = useUiReducedMotion();
  const ring = useSharedValue(0);
  useEffect(() => {
    if (reduced) return;
    ring.value = withDelay(500, withRepeat(withSequence(
      withTiming(1, { duration: 90 }), withTiming(-1, { duration: 120 }), withTiming(0.7, { duration: 110 }),
      withTiming(-0.5, { duration: 110 }), withTiming(0, { duration: 140, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 2600 }),
    ), -1, false));
    return () => cancelAnimation(ring);
  }, [reduced, ring]);
  const bellStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${ring.value * 14}deg` }] }));
  return (
    <Reanimated.View entering={reduced ? undefined : FadeInDown.springify().damping(14)} style={styles.empty}>
      <Reanimated.View style={bellStyle}>
        <GameIcon name="bell" size={110} />
      </Reanimated.View>
      <Text style={styles.emptyTitle} maxFontSizeMultiplier={1.2}>All caught up!</Text>
      <Text style={styles.emptyText} maxFontSizeMultiplier={1.3}>Friend requests, hearts and prizes show up here.</Text>
      <Pill label="Find friends" icon="search" tone="gold" style={{ marginTop: 18 }}
        onPress={() => RootNavigation.navigate('Friends', { tab: 'find' })} />
    </Reanimated.View>
  );
}

export default function NotificationsScreen() {
  const { refreshNotificationCount } = useContext(NotificationContext);
  const { showToast } = useToast();
  const overrides = useFriendOverrides();
  const reduced = useUiReducedMotion();
  const [items, setItems] = useState<NotificationType[]>([]);
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [paging, setPaging] = useState<'idle' | 'busy' | 'error'>('idle');
  const [refreshing, setRefreshing] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const lastFetch = useRef(0);
  const firstPaint = useRef(true);
  // Callbacks read the latest list through refs, so they stay stable and a
  // read or clear re-renders only the rows it touched.
  const readRef = useRef(readIds);
  readRef.current = readIds;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const pendingClears = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const loadFirst = useCallback(async () => {
    const result = await getNotificationsPage(1);
    lastFetch.current = Date.now();
    setItems(result.items);
    setHasMore(result.hasMore);
    setPage(1);
    setReadIds(new Set());
  }, []);

  useFocusEffect(useCallback(() => {
    if (Date.now() - lastFetch.current < REFOCUS_MS) return;
    loadFirst().then(() => setLoad('ready')).catch(() => setLoad(current => (current === 'ready' ? current : 'error')));
  }, [loadFirst]));

  useEffect(() => { const t = setTimeout(() => { firstPaint.current = false; }, 1200); return () => clearTimeout(t); }, []);

  const more = useCallback(() => {
    if (!hasMore || paging === 'busy') return;
    setPaging('busy');
    getNotificationsPage(page + 1)
      .then(result => { setItems(list => mergePage(list, result.items)); setHasMore(result.hasMore); setPage(p => p + 1); setPaging('idle'); })
      .catch(() => setPaging('error'));
  }, [hasMore, paging, page]);

  const markRead = useCallback((item: NotificationType) => {
    if (!isUnread(item, readRef.current)) return;
    setReadIds(prev => new Set(prev).add(item.id));
    markAsRead(item.id).then(refreshNotificationCount).catch(() => undefined);
  }, [refreshNotificationCount]);

  const open = useCallback((item: NotificationType) => {
    playSfx('tap');
    haptic('tapLight');
    markRead(item);
    const target = resolveRoute(item.content?.route);
    if (target) {
      try { RootNavigation.navigate(target.screen, target.params); } catch { /* unknown screen on this build */ }
    }
  }, [markRead]);

  const answered = useCallback((item: NotificationType) => { markRead(item); }, [markRead]);

  // Press and hold: the row goes at once, with an Undo toast; it is deleted
  // on the server only if the toast is not undone.
  const clear = useCallback((item: NotificationType) => {
    haptic('hitMedium');
    playSfx('whoosh');
    const index = itemsRef.current.findIndex(n => n.id === item.id);
    const wasUnread = isUnread(item, readRef.current);
    setItems(list => list.filter(n => n.id !== item.id));
    const restore = () => {
      const timer = pendingClears.current.get(item.id);
      if (timer) clearTimeout(timer);
      pendingClears.current.delete(item.id);
      setItems(list => (list.some(n => n.id === item.id) ? list : (() => { const next = [...list]; next.splice(Math.max(0, index), 0, item); return next; })()));
    };
    pendingClears.current.set(item.id, setTimeout(() => {
      pendingClears.current.delete(item.id);
      deleteNotification(item.id)
        .then(() => { if (wasUnread) void refreshNotificationCount(); })
        .catch(() => { restore(); showToast({ type: 'error', message: "Couldn't clear it. Try again." }); });
    }, 4000));
    showToast({ type: 'info', icon: 'check', message: 'Cleared', duration: 4000, action: { label: 'Undo', onPress: restore } });
  }, [refreshNotificationCount, showToast]);

  // Leaving the screen sends any clears still waiting on their Undo.
  useEffect(() => () => {
    for (const [id, timer] of pendingClears.current) { clearTimeout(timer); void deleteNotification(id).catch(() => undefined); }
  }, []);

  const readAll = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    playSfx('star');
    haptic('success');
    const before = readRef.current;
    setReadIds(new Set(itemsRef.current.map(n => n.id)));
    try {
      await markAllAsRead();
      await refreshNotificationCount();
    } catch {
      setReadIds(before);
      showToast({ type: 'error', message: "Couldn't mark them read. Try again." });
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, refreshNotificationCount, showToast]);

  // A request answered No leaves the bell at once (the server deletes it too).
  const shown = useMemo(() => items.filter(n => {
    const actor = actorOf(n);
    return !(kindOf(n) === 'friend_request' && actor !== null && overrides.get(actor) === 'none');
  }), [items, overrides]);
  const rows = useMemo(() => sectionize(shown, readIds), [shown, readIds]);
  const firstHeader = rows.find(r => r.type === 'header')?.key;
  const unreadCount = useMemo(() => items.filter(n => isUnread(n, readIds)).length, [items, readIds]);

  const renderItem = useCallback(({ item, index }: { item: InboxRow<NotificationType>; index: number }) => {
    if (item.type === 'header') {
      return (
        <SectionHeader label={item.label} count={item.count} icon={item.key === 'h-today' ? 'bell' : 'timer'}
          right={item.key === firstHeader && showMarkAllRead(itemsRef.current, readRef.current)
            ? <Pill compact tone="white" icon="check" label="Read all" onPress={readAll} disabled={markingAll} accessibilityLabel="Mark all as read" />
            : undefined} />
      );
    }
    const actor = actorOf(item.item);
    const row = (
      <Notification
        notification={item.item}
        unread={isUnread(item.item, readIds)}
        answer={actor ? overrides.get(actor) : undefined}
        onOpen={open}
        onClear={clear}
        onAnswered={answered}
      />
    );
    return firstPaint.current && !reduced && index < 7
      ? <Reanimated.View entering={FadeInDown.delay(index * 45).springify().damping(16)}>{row}</Reanimated.View>
      : row;
  }, [readIds, overrides, open, clear, answered, reduced, readAll, markingAll, firstHeader]);

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>Notifications</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false}><View style={{ width: 44 }} /></TopbarColumn>
      </Topbar>
      <SocialBackdrop>
        {load === 'loading' && <SharkLoader state="loading" tone="onBlue" title="Checking your bell" />}
        {load === 'error' && (
          <SocialError title="Notifications didn't load"
            onRetry={() => { setLoad('loading'); loadFirst().then(() => setLoad('ready')).catch(() => setLoad('error')); }} />
        )}
        {load === 'ready' && (
          <>
            <FlashList
              data={rows}
              extraData={overrides}
              keyExtractor={row => row.key}
              getItemType={row => row.type}
              estimatedItemSize={NOTIFICATION_ROW_HEIGHT}
              renderItem={renderItem}
              contentContainerStyle={{ paddingTop: 4, paddingBottom: 120 }}
              onEndReachedThreshold={0.6}
              onEndReached={more}
              refreshControl={<RefreshControl refreshing={refreshing} tintColor="#FFFFFF"
                onRefresh={() => { setRefreshing(true); loadFirst().catch(() => undefined).finally(() => setRefreshing(false)); }} />}
              ListEmptyComponent={<CaughtUp />}
              ListFooterComponent={paging === 'error'
                ? <View style={styles.footer}><Pill compact tone="white" icon="retry" label="Try again" onPress={more} /></View>
                : paging === 'busy' ? <SharkLoader state="loading" tone="onBlue" compact /> : null}
            />
          </>
        )}
      </SocialBackdrop>
    </>
  );
}

const styles = StyleSheet.create({
  footer: { alignItems: 'center', paddingVertical: 12 },
  empty: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 90 },
  emptyTitle: { fontFamily: FONT.display, fontSize: 28, color: '#FFFFFF', textTransform: 'uppercase', marginTop: 12, textShadowColor: INK, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  emptyText: { fontFamily: FONT.body, fontSize: 18, color: '#FFFFFF', textAlign: 'center', marginTop: 6, textShadowColor: 'rgba(5,52,110,0.6)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2 },
});
