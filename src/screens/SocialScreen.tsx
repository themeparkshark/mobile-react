import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { useAsyncEffect } from 'rooks';
import getThreads from '../api/endpoints/threads/getThreads';
import getThread from '../api/endpoints/threads/getThread';
import getComments from '../api/endpoints/comments/getComments';
import createComment from '../api/endpoints/comments/create';
import Button from '../components/Button';
import CreateThreadModal from '../components/CreateThreadModal';
import Loading from '../components/Loading';
import PlayerButtons from '../components/PlayerButtons';
import InformationModal from '../components/InformationModal';
import { InformationModalEnums } from '../models/information-modal-enums';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { ForumContext } from '../context/ForumProvider';
import useCrumbs from '../hooks/useCrumbs';
import usePermissions from '../hooks/usePermissions';
import { PermissionEnums } from '../models/permission-enums';
import { ThreadType } from '../models/thread-type';
import { CommentType } from '../models/comment-type';
import Avatar from '../components/Avatar';
import Reactions from '../components/Reactions';
import ReactionsDropdown from '../components/ReactionsDropdown';
import Comment from '../components/Comment';
import AttachmentModal from '../components/AttachmentModal';
import Tag from '../components/Tag';
import ThreadActions from '../components/ThreadActions';
import CreateReport from '../components/CreateReport';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faComment } from '@fortawesome/free-solid-svg-icons/faComment';
import { faFire } from '@fortawesome/free-solid-svg-icons/faFire';
import { faBolt } from '@fortawesome/free-solid-svg-icons/faBolt';
import { faHeart } from '@fortawesome/free-solid-svg-icons/faHeart';
import { faThumbtack } from '@fortawesome/free-solid-svg-icons/faThumbtack';
import { faEllipsis } from '@fortawesome/free-solid-svg-icons/faEllipsis';
import { faPaperPlane } from '@fortawesome/free-solid-svg-icons/faPaperPlane';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons/faChevronDown';
import { faReply } from '@fortawesome/free-solid-svg-icons/faReply';
import { faPlus } from '@fortawesome/free-solid-svg-icons/faPlus';
import dayjs from '../helpers/dayjs';
import { truncate } from 'lodash';
import RichText from '../components/RichText';
import shortenNumber from '../helpers/shorten-number';
import * as RootNavigation from '../RootNavigation';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { faUsers } from '@fortawesome/free-solid-svg-icons/faUsers';
import { faGlobe } from '@fortawesome/free-solid-svg-icons/faGlobe';
import { faLock } from '@fortawesome/free-solid-svg-icons/faLock';

const sheetOpenSound = require('../../assets/sounds/modal_open.mp3');
const sheetCloseSound = require('../../assets/sounds/modal_close.mp3');

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.72;

// ── Filter Pills ──────────────────────────────────────────
import { faUserGroup } from '@fortawesome/free-solid-svg-icons/faUserGroup';

const FILTERS = [
  { label: 'Hot', value: 'hottest', icon: faFire, color: '#ff6b35' },
  { label: 'New', value: 'latest', icon: faBolt, color: '#00a5f5' },
  { label: 'Friends', value: 'friends', icon: faUserGroup, color: '#8b5cf6' },
];

// Team data
const TEAMS = {
  mouse: { name: 'Team Mouse', emoji: '🐭', color: '#3B82F6' },
  globe: { name: 'Team Globe', emoji: '🌍', color: '#EF4444' },
  shark: { name: 'Team Shark', emoji: '🦈', color: '#F59E0B' },
} as const;

// ── Feed Mode Toggle (Public / Team) ──────────────────────
function FeedModeToggle({
  mode,
  onToggle,
  teamName,
  teamEmoji,
  teamColor,
}: {
  mode: 'public' | 'team';
  onToggle: (m: 'public' | 'team') => void;
  teamName?: string;
  teamEmoji?: string;
  teamColor?: string;
}) {
  return (
    <View style={toggleStyles.container}>
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggle('public'); }}
        style={[toggleStyles.tab, mode === 'public' && toggleStyles.activeTab]}
      >
        <FontAwesomeIcon icon={faGlobe} size={13} color={mode === 'public' ? '#0d1b2a' : '#a0aec0'} />
        <Text style={[toggleStyles.tabText, mode === 'public' && toggleStyles.activeText]}>Public</Text>
      </Pressable>
      <Pressable
        onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onToggle('team'); }}
        style={[toggleStyles.tab, mode === 'team' && { ...toggleStyles.activeTab, backgroundColor: (teamColor || '#F59E0B') + '18' }]}
      >
        {teamEmoji ? (
          <Text style={{ fontSize: 13 }}>{teamEmoji}</Text>
        ) : (
          <FontAwesomeIcon icon={faUsers} size={13} color={mode === 'team' ? (teamColor || '#F59E0B') : '#a0aec0'} />
        )}
        <Text style={[toggleStyles.tabText, mode === 'team' && { ...toggleStyles.activeText, color: teamColor || '#F59E0B' }]}>
          {teamName || 'Team'}
        </Text>
      </Pressable>
    </View>
  );
}

const toggleStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 4,
    marginBottom: 2,
    backgroundColor: 'white',
    borderRadius: 14,
    padding: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 11,
  },
  activeTab: {
    backgroundColor: '#f0f4f8',
  },
  tabText: {
    fontFamily: 'Shark',
    fontSize: 13,
    color: '#a0aec0',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  activeText: {
    color: '#0d1b2a',
  },
});

function FilterPills({ active, onSelect }: { active: string; onSelect: (v: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={pillStyles.container}>
      {FILTERS.map((f) => {
        const isActive = active === f.value;
        return (
          <Pressable
            key={f.value}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onSelect(f.value); }}
            style={[pillStyles.pill, isActive && { backgroundColor: f.color }]}
          >
            <FontAwesomeIcon icon={f.icon} size={12} color={isActive ? 'white' : '#8895a7'} />
            <Text style={[pillStyles.pillText, isActive && { color: 'white' }]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const pillStyles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  pill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20,
    backgroundColor: 'white',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  pillText: { fontFamily: 'Shark', fontSize: 13, color: '#8895a7', textTransform: 'uppercase', letterSpacing: 0.5 },
});

// ── Thread Card ───────────────────────────────────────────
function ThreadCard({ thread, index, onPress, onDelete }: { thread: ThreadType; index: number; onPress: () => void; onDelete?: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const delay = Math.min(index * 60, 300);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 350, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  const { player } = useContext(AuthContext);

  const handlePressIn = () => Animated.spring(pressScale, { toValue: 0.97, friction: 8, useNativeDriver: true }).start();
  const handlePressOut = () => Animated.spring(pressScale, { toValue: 1, friction: 4, tension: 300, useNativeDriver: true }).start();

  const isOwner = player?.id === thread.player?.id;
  const hasImage = thread.attachments?.length > 0;
  const isPinned = !!thread.pinned_at;
  const isTeam = !!thread.team;
  const threadTeamInfo = thread.team ? TEAMS[thread.team as keyof typeof TEAMS] : null;

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }, { scale: pressScale }] }}>
      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onPress(); }} style={cardStyles.card}>
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: (isPinned || isTeam) ? 8 : 0 }}>
          {isPinned && (
            <View style={cardStyles.pinnedBanner}>
              <FontAwesomeIcon icon={faThumbtack} size={10} color={config.primary} />
              <Text style={cardStyles.pinnedText}>Pinned</Text>
            </View>
          )}
          {isTeam && threadTeamInfo && (
            <View style={[cardStyles.pinnedBanner, { backgroundColor: threadTeamInfo.color + '15' }]}>
              <Text style={{ fontSize: 10 }}>{threadTeamInfo.emoji}</Text>
              <Text style={[cardStyles.pinnedText, { color: threadTeamInfo.color }]}>{threadTeamInfo.name}</Text>
            </View>
          )}
        </View>
        {/* Author row — always visible like a tweet */}
        <View style={cardStyles.authorRow}>
          <Avatar player={thread.player} size="sm" showLevel />
          <View style={{ flex: 1 }}>
            <Text style={cardStyles.author} numberOfLines={1}>{thread.player.screen_name}</Text>
          </View>
          <Text style={cardStyles.timeText}>{dayjs(thread.created_at).startOf('second').fromNow()}</Text>
          {isOwner && (
            <ThreadActions
              trigger={
                <View style={{ padding: 4 }}>
                  <FontAwesomeIcon icon={faEllipsis} size={16} color="#8895a7" />
                </View>
              }
              thread={thread}
              onDelete={onDelete}
            />
          )}
        </View>

        {/* Content — tweet-style body text */}
        <RichText style={cardStyles.body} numberOfLines={4}>
          {thread.content || thread.title}
        </RichText>

        {/* Image attachment — wide card below text */}
        {hasImage && (
          <Image source={thread.attachments[0].path} style={cardStyles.imageAttachment} contentFit="cover" />
        )}

        {/* Latest reply preview */}
        {thread.latest_comment && !isPinned && (
          <View style={cardStyles.replyPreview}>
            <Text style={cardStyles.replyMeta} numberOfLines={1}>
              {thread.latest_comment.player?.screen_name} replied {dayjs(thread.latest_comment.created_at).startOf('second').fromNow()}
            </Text>
            <Text style={cardStyles.replyText} numberOfLines={2}>{truncate(thread.latest_comment.content, { length: 120 })}</Text>
          </View>
        )}

        {/* Bottom row — reactions + comment count */}
        <View style={cardStyles.bottomRow}>
          {thread.reactions?.length > 0 && (
            <View style={{ flex: 1 }}><Reactions count={thread.reactions_count} reactions={thread.reactions} /></View>
          )}
          <View style={cardStyles.commentBadge}>
            <FontAwesomeIcon icon={faComment} size={13} color={config.secondary} />
            <Text style={cardStyles.commentCount}>{shortenNumber(thread.comments_count)}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const cardStyles = StyleSheet.create({
  card: {
    marginHorizontal: 12, marginBottom: 10, backgroundColor: 'white', borderRadius: 16, padding: 14,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 3,
  },
  pinnedBanner: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: '#e8edff', borderRadius: 8, alignSelf: 'flex-start' },
  pinnedText: { fontFamily: 'Shark', fontSize: 10, color: config.primary, textTransform: 'uppercase', letterSpacing: 0.5 },
  authorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  author: { fontFamily: 'Shark', fontSize: 13, color: '#0d1b2a', textTransform: 'uppercase', letterSpacing: 0.3 },
  timeText: { fontSize: 11, color: '#8895a7', fontFamily: 'Shark' },
  body: { fontSize: 15, lineHeight: 21, color: '#1a2332', marginBottom: 8 },
  imageAttachment: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, marginBottom: 8 },
  replyPreview: { backgroundColor: '#f8fafc', borderRadius: 10, padding: 8, marginBottom: 8, borderLeftWidth: 2, borderLeftColor: config.secondary },
  replyMeta: { fontSize: 10, color: '#8895a7', marginBottom: 2, fontFamily: 'Shark' },
  replyText: { fontSize: 12, color: '#5a6a7e', lineHeight: 16 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  commentBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#f0f8ff', borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4 },
  commentCount: { fontFamily: 'Knockout', fontSize: 16, color: config.secondary },
});

// ── Refresh Banner ────────────────────────────────────────
function RefreshBanner() {
  const spinAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.timing(spinAnim, { toValue: 1, duration: 1200, easing: Easing.linear, useNativeDriver: true })).start();
  }, []);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 14, gap: 10 }}>
      <Animated.View style={{ transform: [{ rotate: spinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
        <Image source={require('../../assets/images/coingold.png')} style={{ width: 24, height: 24 }} contentFit="contain" />
      </Animated.View>
      <Text style={{ fontFamily: 'Shark', fontSize: 12, color: '#5a6a7e', textTransform: 'uppercase', letterSpacing: 1 }}>Refreshing</Text>
    </View>
  );
}

// ── Empty State ───────────────────────────────────────────
function EmptyState() {
  const bounceAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(bounceAnim, { toValue: -8, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(bounceAnim, { toValue: 0, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ])).start();
  }, []);
  return (
    <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 }}>
      <Animated.Text style={{ fontSize: 48, transform: [{ translateY: bounceAnim }] }}>🦈</Animated.Text>
      <Text style={{ fontFamily: 'Knockout', fontSize: 22, color: '#0d1b2a', marginTop: 16, textAlign: 'center' }}>No threads yet!</Text>
      <Text style={{ fontSize: 14, color: '#8895a7', marginTop: 8, textAlign: 'center', lineHeight: 20 }}>Be the first to start a conversation — tap the pencil icon above!</Text>
    </View>
  );
}

// ── Thread Detail Sheet ───────────────────────────────────
function ThreadSheet({
  threadId,
  visible,
  onClose,
}: {
  threadId: number | null;
  visible: boolean;
  onClose: () => void;
}) {
  const [thread, setThread] = useState<ThreadType | null>(null);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [activeSort, setActiveSort] = useState('latest');
  const { player } = useContext(AuthContext);
  const { reactionTypes, setActiveComment, activeComment, setRecentlyAddedComment } = useContext(ForumContext);
  const { playSound } = useContext(SoundEffectContext);
  const { labels } = useCrumbs();
  const inputRef = useRef<TextInput>(null);
  const scrollRef = useRef<ScrollView>(null);

  // Sound on open
  useEffect(() => {
    if (visible && threadId) {
      playSound(sheetOpenSound);
    }
  }, [visible, threadId]);

  const handleClose = () => {
    playSound(sheetCloseSound);
    Keyboard.dismiss();
    setActiveComment(undefined);
    onClose();
  };

  // Load thread + comments
  useEffect(() => {
    if (!threadId || !visible) return;
    setLoading(true);
    setThread(null);
    setComments([]);
    setPage(1);
    setReplyText('');
    setActiveComment(undefined);

    (async () => {
      try {
        const t = await getThread(threadId);
        setThread(t);
        const c = await getComments(threadId, 1, { sort: activeSort });
        setComments(c);
      } catch (e) {
        console.log('Thread load error:', e);
      }
      setLoading(false);
    })();
  }, [threadId, visible]);

  // Reload comments on sort change
  useEffect(() => {
    if (!thread || loading) return;
    (async () => {
      const c = await getComments(thread.id, 1, { sort: activeSort });
      setComments(c);
      setPage(1);
    })();
  }, [activeSort]);

  const loadMore = async () => {
    if (!thread) return;
    const nextPage = page + 1;
    const more = await getComments(thread.id, nextPage, { sort: activeSort });
    setComments(prev => [...prev, ...more]);
    setPage(nextPage);
  };

  const handleSend = async () => {
    if (!replyText.trim() || sending || !thread) return;
    setSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const response = await createComment(thread.id, replyText.trim(), activeComment?.id);
      setRecentlyAddedComment(response);
      setReplyText('');
      setActiveComment(undefined);
      Keyboard.dismiss();
      // Refresh
      const [newThread, newComments] = await Promise.all([
        getThread(thread.id),
        getComments(thread.id, 1, { sort: activeSort }),
      ]);
      setThread(newThread);
      setComments(newComments);
      setPage(1);
    } catch (e) {
      console.log('Reply error:', e);
    }
    setSending(false);
  };

  const refreshThread = async () => {
    if (!thread) return;
    setThread(await getThread(thread.id));
  };

  const SORT_OPTIONS = [
    { label: 'New', value: 'latest', icon: faBolt, color: '#00a5f5' },
    { label: 'Reactions', value: 'most_reactions', icon: faHeart, color: '#ef4444' },
  ];

  return (
    <Modal
      isVisible={visible}
      onBackdropPress={handleClose}
      onSwipeComplete={handleClose}
      swipeDirection="down"
      swipeThreshold={50}
      propagateSwipe
      style={{ margin: 0, justifyContent: 'flex-end' }}
      backdropOpacity={0.4}
      animationIn="slideInUp"
      animationOut="slideOutDown"
      animationInTiming={300}
      animationOutTiming={200}
      useNativeDriverForBackdrop
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ height: SHEET_HEIGHT, backgroundColor: '#f0f4f8', borderTopLeftRadius: 24, borderTopRightRadius: 24, overflow: 'hidden' }}
      >
        {/* Handle bar + close button */}
        <View style={sheetStyles.handleBar}>
          <View style={{ flex: 1 }} />
          <View style={sheetStyles.handle} />
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={handleClose} style={sheetStyles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <FontAwesomeIcon icon={faChevronDown} size={14} color="#8895a7" />
            </TouchableOpacity>
          </View>
        </View>

        {loading ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Loading />
          </View>
        ) : thread ? (
          <>
            {/* Scrollable content */}
            <ScrollView
              ref={scrollRef}
              style={{ flex: 1 }}
              contentContainerStyle={{ paddingBottom: 20 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              onScrollEndDrag={({ nativeEvent }) => {
                // Load more when near bottom
                const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
                if (layoutMeasurement.height + contentOffset.y >= contentSize.height - 100) {
                  loadMore();
                }
              }}
            >
              {/* Thread Header Card */}
              <View style={sheetStyles.threadCard}>
                {/* Top bar with author + actions */}
                <View style={sheetStyles.threadTopRow}>
                  <Button onPress={() => { handleClose(); RootNavigation.navigate('Player', { player: thread.player.id }); }}>
                    <Avatar size="sm" player={thread.player} showLevel />
                  </Button>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={sheetStyles.authorName}>{thread.player.screen_name}</Text>
                    <View style={sheetStyles.timePill}>
                      <Text style={sheetStyles.timeText}>{dayjs(thread.created_at).startOf('second').fromNow()}</Text>
                    </View>
                  </View>
                  <ThreadActions
                    trigger={
                      <View style={sheetStyles.moreBtn}>
                        <FontAwesomeIcon icon={faEllipsis} size={18} color="#8895a7" />
                      </View>
                    }
                    thread={thread}
                    onDelete={handleClose}
                  />
                </View>

                {/* Content — full text, no title */}
                <RichText style={sheetStyles.threadContent}>{thread.content || thread.title}</RichText>

                {/* Tags */}
                {thread.tags?.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 4, gap: 4 }}>
                    {thread.tags.map((tag) => <Tag key={tag.id} tag={tag} />)}
                  </View>
                )}

                {/* Attachments */}
                {thread.attachments?.length > 0 && (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginBottom: 8 }}>
                    {thread.attachments.map((a) => (
                      <View key={a.id} style={{ width: thread.attachments.length > 1 ? '33.333%' : '100%', padding: 4 }}>
                        <AttachmentModal attachment={a} />
                      </View>
                    ))}
                  </View>
                )}

                {/* Actions */}
                <View style={sheetStyles.actionsRow}>
                  <ReactionsDropdown
                    model={{ id: thread.id, type: 'thread' }}
                    activeReaction={thread.current_user_reaction}
                    onReactionChange={refreshThread}
                  >
                    {thread.current_user_reaction ? (
                      <View style={sheetStyles.reactionBtn}>
                        <Image source={{ uri: thread.current_user_reaction.reaction_type.image_url }} style={{ width: 18, height: 18 }} />
                        <Text style={sheetStyles.reactionLabel}>{thread.current_user_reaction.reaction_type.name}</Text>
                      </View>
                    ) : (
                      <View style={sheetStyles.reactionBtn}>
                        <Image source={{ uri: reactionTypes[0]?.image_url }} style={{ width: 18, height: 18 }} />
                        <Text style={[sheetStyles.reactionLabel, { color: '#8895a7' }]}>React</Text>
                      </View>
                    )}
                  </ReactionsDropdown>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
                    <View style={sheetStyles.commentCountChip}>
                      <FontAwesomeIcon icon={faComment} size={14} color={config.secondary} />
                      <Text style={sheetStyles.commentCountNum}>{thread.comments_count}</Text>
                    </View>
                    {player && <CreateReport model={{ id: thread.id, type: 'thread' }} />}
                  </View>
                </View>

                {/* Reactions summary */}
                {thread.reactions_count > 0 && (
                  <View style={{ marginTop: 10, zIndex: -1 }}>
                    <Reactions count={thread.reactions_count} reactions={thread.reactions} hasReacted={thread.current_user_reaction} />
                  </View>
                )}
              </View>

              {/* Comments */}
              {comments.length === 0 ? (
                <View style={{ alignItems: 'center', paddingVertical: 24 }}>
                  <Text style={{ fontSize: 28 }}>💬</Text>
                  <Text style={{ fontFamily: 'Shark', fontSize: 12, color: '#8895a7', marginTop: 6, textTransform: 'uppercase' }}>No comments yet</Text>
                  <Text style={{ fontSize: 12, color: '#a0aec0', marginTop: 2 }}>Be the first to reply!</Text>
                </View>
              ) : (
                comments.map((c, i) => (
                  <View
                    key={c.id}
                    style={{
                      marginHorizontal: 10,
                      marginBottom: 6,
                      backgroundColor: 'white',
                      borderRadius: 12,
                      overflow: 'hidden',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.04,
                      shadowRadius: 4,
                      elevation: 1,
                    }}
                  >
                    <Comment comment={c} onReplyPress={(comment) => {
                      setActiveComment(comment);
                      inputRef.current?.focus();
                    }} />
                  </View>
                ))
              )}
            </ScrollView>

            {/* Reply input */}
            {player && (
              <View style={sheetStyles.replyBar}>
                {activeComment && (
                  <View style={sheetStyles.replyingTo}>
                    <FontAwesomeIcon icon={faReply} size={10} color={config.secondary} />
                    <Text style={sheetStyles.replyingToText} numberOfLines={1}>
                      Replying to {activeComment.player?.screen_name}
                    </Text>
                    <TouchableOpacity onPress={() => setActiveComment(undefined)}>
                      <Text style={sheetStyles.replyingToCancel}>✕</Text>
                    </TouchableOpacity>
                  </View>
                )}
                <View style={sheetStyles.inputRow}>
                  <TextInput
                    ref={inputRef}
                    style={sheetStyles.input}
                    placeholder={labels.add_a_comment || 'Add a comment...'}
                    placeholderTextColor="#a0aec0"
                    value={replyText}
                    onChangeText={setReplyText}
                    multiline
                    maxLength={2000}
                  />
                  <TouchableOpacity
                    onPress={handleSend}
                    disabled={!replyText.trim() || sending}
                    style={[
                      sheetStyles.sendBtn,
                      (!replyText.trim() || sending) && { opacity: 0.4 },
                    ]}
                  >
                    <FontAwesomeIcon icon={faPaperPlane} size={16} color="white" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const sheetStyles = StyleSheet.create({
  handleBar: { flexDirection: 'row', alignItems: 'center', paddingTop: 10, paddingBottom: 6, paddingHorizontal: 16 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: '#d0d5dd' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f0f4f8', alignItems: 'center', justifyContent: 'center' },
  threadCard: {
    marginHorizontal: 12, marginTop: 6, marginBottom: 2,
    backgroundColor: 'white', borderRadius: 14, padding: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2,
  },
  threadTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  authorName: { fontFamily: 'Shark', fontSize: 12, color: '#0d1b2a', textTransform: 'uppercase', letterSpacing: 0.3 },
  timePill: { backgroundColor: '#f0f4f8', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, alignSelf: 'flex-start', marginTop: 2 },
  timeText: { fontSize: 10, color: '#8895a7', fontFamily: 'Shark' },
  moreBtn: { padding: 6, borderRadius: 10, backgroundColor: '#f0f4f8' },
  threadContent: { fontSize: 15, lineHeight: 22, color: '#1a2332', marginBottom: 8 },
  actionsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f0f4f8',
  },
  reactionBtn: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  reactionLabel: { fontFamily: 'Shark', fontSize: 11, color: '#0d1b2a', textTransform: 'uppercase' },
  commentCountChip: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#f0f8ff', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  commentCountNum: { fontFamily: 'Knockout', fontSize: 14, color: config.secondary },
  // Reply bar
  replyBar: {
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e8ecf0',
    paddingHorizontal: 10,
    paddingTop: 6,
    paddingBottom: Platform.OS === 'ios' ? 24 : 10,
  },
  replyingTo: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 4, paddingHorizontal: 8,
    backgroundColor: '#f0f8ff', borderRadius: 8, marginBottom: 4,
  },
  replyingToText: { flex: 1, fontSize: 11, color: config.secondary, fontFamily: 'Shark' },
  replyingToCancel: { fontSize: 13, color: '#8895a7', paddingHorizontal: 4 },
  inputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6 },
  input: {
    flex: 1, fontSize: 14, color: '#0d1b2a',
    backgroundColor: '#f0f4f8', borderRadius: 18,
    paddingHorizontal: 14, paddingTop: 8, paddingBottom: 8,
    maxHeight: 80,
  },
  sendBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: config.secondary,
    alignItems: 'center', justifyContent: 'center',
  },
});

// ── Floating Compose Button ───────────────────────────────
function ComposeButton() {
  const scaleAnim = useRef(new Animated.Value(0)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const { checkPermission } = usePermissions();
  const { playSound } = useContext(SoundEffectContext);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 5,
      tension: 120,
      delay: 400,
      useNativeDriver: true,
    }).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(pressScale, { toValue: 0.85, friction: 8, useNativeDriver: true }).start();
  };

  const handlePressOut = () => {
    Animated.spring(pressScale, { toValue: 1, friction: 4, tension: 300, useNativeDriver: true }).start();
  };

  return (
    <>
      <Animated.View
        style={[
          fabStyles.container,
          { transform: [{ scale: Animated.multiply(scaleAnim, pressScale) }] },
        ]}
      >
        <Pressable
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={() => {
            if (checkPermission(PermissionEnums.CreateThreads)) {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              playSound(sheetOpenSound);
              setShowModal(true);
            }
          }}
          style={fabStyles.button}
        >
          <FontAwesomeIcon icon={faPlus} size={22} color="white" />
        </Pressable>
      </Animated.View>
      <CreateThreadModal visible={showModal} onClose={() => setShowModal(false)} />
    </>
  );
}

const fabStyles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    bottom: 72, // Nudged down, just above tab bar
    zIndex: 100,
  },
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: config.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: config.secondary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 8,
  },
});

// ── Main Screen ───────────────────────────────────────────
export default function SocialScreen({ navigation }) {
  const [threads, setThreads] = useState<ThreadType[]>([]);
  const [pinnedThreads, setPinnedThreads] = useState<ThreadType[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [activeFilter, setActiveFilter] = useState('hottest');
  const [feedMode, setFeedMode] = useState<'public' | 'team'>('public');
  const [selectedThreadId, setSelectedThreadId] = useState<number | null>(null);
  const { labels, urls } = useCrumbs();
  const { checkPermission } = usePermissions();
  const { player } = useContext(AuthContext);

  // Get player's team
  const playerTeam = (player as any)?.team?.team as string | undefined;
  const teamInfo = playerTeam ? TEAMS[playerTeam as keyof typeof TEAMS] : null;

  const fetchPinnedThreads = async () => {
    setPinnedThreads(await getThreads(1, { pinned: true }));
  };

  const fetchThreads = async (p: number) => {
    const isFriends = activeFilter === 'friends';
    const opts: any = { sort: isFriends ? 'latest' : activeFilter };
    if (isFriends) {
      opts.friends = true;
    }
    if (feedMode === 'team' && playerTeam) {
      opts.team = playerTeam;
    }
    const response = await getThreads(p, opts);
    setThreads(prev => (p === 1 ? response : [...prev, ...response]));
  };

  useAsyncEffect(async () => {
    if (loading) return;
    setThreads([]);
    await fetchThreads(1);
    setPage(1);
  }, [activeFilter, feedMode]);

  useAsyncEffect(async () => {
    await fetchPinnedThreads();
    await fetchThreads(1);
    setPage(1);
    setLoading(false);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    const isFriends = activeFilter === 'friends';
    const opts: any = { sort: isFriends ? 'latest' : activeFilter };
    if (isFriends) opts.friends = true;
    const [newThreads] = await Promise.all([
      getThreads(1, opts),
      fetchPinnedThreads(),
    ]);
    setThreads(newThreads);
    setRefreshing(false);
    setPage(1);
  }, [activeFilter]);

  useAsyncEffect(async () => {
    if (page > 1) await fetchThreads(page);
  }, [page]);

  const allThreads = [...pinnedThreads, ...threads.filter(t => !pinnedThreads.some(p => p.id === t.id))];

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false} />
        <TopbarColumn><TopbarText>Social</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false}><InformationModal id={InformationModalEnums.SocialScreen} /></TopbarColumn>
      </Topbar>

      {loading && <Loading />}
      {!loading && (
        <View style={{ flex: 1, backgroundColor: '#f0f4f8' }}>
          <FlashList
            data={allThreads}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={config.secondary} colors={[config.secondary]} />
            }
            contentContainerStyle={{ paddingBottom: 80 }}
            ListHeaderComponent={
              <>
                {refreshing && <RefreshBanner />}
                <View style={{ paddingHorizontal: 16, marginBottom: 8, marginTop: -8 }}>
                  <PlayerButtons
                    buttons={[
                      {
                        image: require('../../assets/images/screens/social/membership.png'),
                        onPress: () => { if (checkPermission(PermissionEnums.BecomeAMember)) navigation.navigate('Membership'); },
                        text: 'Member',
                        permission: PermissionEnums.BecomeAMember,
                        show: !player || Boolean(player && !player.is_subscribed),
                      },
                      {
                        image: require('../../assets/images/screens/social/merch.png'),
                        onPress: () => { WebBrowser.openBrowserAsync(urls.shop); },
                        text: 'Merch',
                      },
                      {
                        image: require('../../assets/images/screens/social/pin_swaps.png'),
                        onPress: () => { if (checkPermission(PermissionEnums.TradePins)) navigation.navigate('PinSwaps'); },
                        text: 'Pin Trading',
                        permission: PermissionEnums.TradePins,
                      },
                      {
                        image: require('../../assets/images/screens/social/redeem.png'),
                        onPress: () => { if (checkPermission(PermissionEnums.RedeemCoinCodes)) navigation.navigate('RedeemCoinCode'); },
                        text: 'Redeem',
                        permission: PermissionEnums.RedeemCoinCodes,
                      },
                      {
                        image: require('../../assets/images/screens/social/social_media.png'),
                        onPress: () => { if (checkPermission(PermissionEnums.WatchContent)) navigation.navigate('Watch'); },
                        text: 'Watch',
                        permission: PermissionEnums.WatchContent,
                      },
                      {
                        image: require('../../assets/images/screens/social/arcade.png'),
                        onPress: () => {},
                        text: 'Arcade',
                        show: false,
                        permission: PermissionEnums.ViewArcade,
                      },
                    ]}
                  />
                </View>
                {playerTeam && (
                  <FeedModeToggle
                    mode={feedMode}
                    onToggle={setFeedMode}
                    teamName={teamInfo?.name}
                    teamEmoji={teamInfo?.emoji}
                    teamColor={teamInfo?.color}
                  />
                )}
                <FilterPills active={activeFilter} onSelect={setActiveFilter} />
              </>
            }
            ListEmptyComponent={<EmptyState />}
            renderItem={({ item, index }) => (
              <ThreadCard thread={item} index={index} onPress={() => setSelectedThreadId(item.id)} onDelete={onRefresh} />
            )}
            estimatedItemSize={140}
            keyExtractor={(item) => item.id.toString()}
            onEndReached={() => setPage(prev => prev + 1)}
            onEndReachedThreshold={0.3}
          />
        </View>
      )}

      {/* Thread detail bottom sheet */}
      <ThreadSheet
        threadId={selectedThreadId}
        visible={selectedThreadId !== null}
        onClose={() => {
          setSelectedThreadId(null);
        }}
      />

      {/* Floating compose button */}
      <ComposeButton />
    </Wrapper>
  );
}
