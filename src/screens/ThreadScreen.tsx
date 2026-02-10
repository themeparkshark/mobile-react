import { faEllipsis } from '@fortawesome/free-solid-svg-icons/faEllipsis';
import { faComment } from '@fortawesome/free-solid-svg-icons/faComment';
import { faBolt } from '@fortawesome/free-solid-svg-icons/faBolt';
import { faHeart } from '@fortawesome/free-solid-svg-icons/faHeart';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import getComments from '../api/endpoints/comments/getComments';
import getThread from '../api/endpoints/threads/getThread';
import AttachmentModal from '../components/AttachmentModal';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Comment from '../components/Comment';
import CreateReply from '../components/CreateReply';
import CreateReport from '../components/CreateReport';
import Loading from '../components/Loading';
import Reactions from '../components/Reactions';
import ReactionsDropdown from '../components/ReactionsDropdown';
import Tag from '../components/Tag';
import ThreadActions from '../components/ThreadActions';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import { AuthContext } from '../context/AuthProvider';
import { ForumContext } from '../context/ForumProvider';
import dayjs from '../helpers/dayjs';
import useCrumbs from '../hooks/useCrumbs';
import { CommentType } from '../models/comment-type';
import { ThreadType } from '../models/thread-type';
import config from '../config';

// ── Sort Filter Pills ─────────────────────────────────────
const SORT_FILTERS = [
  { label: 'New', value: 'latest', icon: faBolt, color: '#00a5f5' },
  { label: 'Reactions', value: 'most_reactions', icon: faHeart, color: '#ef4444' },
];

function SortPills({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (value: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}
    >
      {SORT_FILTERS.map((f) => {
        const isActive = active === f.value;
        return (
          <Pressable
            key={f.value}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onSelect(f.value);
            }}
            style={[
              sortStyles.pill,
              isActive && { backgroundColor: f.color },
            ]}
          >
            <FontAwesomeIcon icon={f.icon} size={12} color={isActive ? 'white' : '#8895a7'} />
            <Text style={[sortStyles.pillText, isActive && { color: 'white' }]}>{f.label}</Text>
          </Pressable>
        );
      })}
      <View style={sortStyles.commentCountWrap}>
        <FontAwesomeIcon icon={faComment} size={12} color="#8895a7" />
        <Text style={sortStyles.commentCountText}>Comments</Text>
      </View>
    </ScrollView>
  );
}

const sortStyles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'white',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  pillText: {
    fontFamily: 'Shark',
    fontSize: 13,
    color: '#8895a7',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  commentCountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  commentCountText: {
    fontFamily: 'Shark',
    fontSize: 13,
    color: '#8895a7',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

// ── Thread Header Card ────────────────────────────────────
function ThreadHeader({
  thread,
  reactionTypes,
  player,
  onRefresh,
}: {
  thread: ThreadType;
  reactionTypes: any[];
  player: any;
  onRefresh: () => void;
}) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(15)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 400, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View style={[headerStyles.card, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
      {/* Author row */}
      <View style={headerStyles.authorRow}>
        <Button onPress={() => RootNavigation.navigate('Player', { player: thread.player.id })}>
          <Avatar size="md" player={thread.player} showLevel />
        </Button>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={headerStyles.authorName}>{thread.player.screen_name}</Text>
          <View style={headerStyles.timePill}>
            <Text style={headerStyles.timeText}>
              {dayjs(thread.created_at).startOf('second').fromNow()}
            </Text>
          </View>
        </View>
      </View>

      {/* Title */}
      <Text style={headerStyles.title}>{thread.title}</Text>

      {/* Tags */}
      {thread.tags?.length > 0 && (
        <View style={headerStyles.tagRow}>
          {thread.tags.map((tag) => (
            <Tag key={tag.id} tag={tag} />
          ))}
        </View>
      )}

      {/* Content */}
      {thread.content ? (
        <Text style={headerStyles.content}>{thread.content}</Text>
      ) : null}

      {/* Attachments */}
      {thread.attachments?.length > 0 && (
        <View style={headerStyles.attachmentRow}>
          {thread.attachments.map((attachment) => (
            <View
              key={attachment.id}
              style={{
                width: thread.attachments.length > 1 ? '33.3333%' : '100%',
                padding: 4,
              }}
            >
              <AttachmentModal attachment={attachment} />
            </View>
          ))}
        </View>
      )}

      {/* Actions row */}
      <View style={headerStyles.actionsRow}>
        <View style={headerStyles.reactionWrap}>
          <ReactionsDropdown
            model={{ id: thread.id, type: 'thread' }}
            activeReaction={thread.current_user_reaction}
            onReactionChange={onRefresh}
          >
            {thread.current_user_reaction ? (
              <View style={headerStyles.reactionBtn}>
                <Image
                  source={{ uri: thread.current_user_reaction.reaction_type.image_url }}
                  style={{ width: 22, height: 22 }}
                />
                <Text style={headerStyles.reactionText}>
                  {thread.current_user_reaction.reaction_type.name}
                </Text>
              </View>
            ) : (
              <View style={headerStyles.reactionBtn}>
                <Image
                  source={{ uri: reactionTypes[0]?.image_url }}
                  style={{ width: 22, height: 22 }}
                />
                <Text style={[headerStyles.reactionText, { color: '#8895a7' }]}>React</Text>
              </View>
            )}
          </ReactionsDropdown>
        </View>
        {player && (
          <CreateReport model={{ id: thread.id, type: 'thread' }} showText />
        )}
      </View>

      {/* Reactions summary */}
      {thread.reactions_count > 0 && (
        <View style={{ marginTop: 12, zIndex: -1 }}>
          <Reactions
            count={thread.reactions_count}
            reactions={thread.reactions}
            hasReacted={thread.current_user_reaction}
          />
        </View>
      )}
    </Animated.View>
  );
}

const headerStyles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 8,
    marginBottom: 4,
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  authorName: {
    fontFamily: 'Shark',
    fontSize: 14,
    color: '#0d1b2a',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  timePill: {
    backgroundColor: '#f0f4f8',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  timeText: {
    fontSize: 11,
    color: '#8895a7',
    fontFamily: 'Shark',
  },
  title: {
    fontFamily: 'Knockout',
    fontSize: 28,
    color: '#0d1b2a',
    lineHeight: 32,
    marginBottom: 8,
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  content: {
    fontSize: 16,
    lineHeight: 24,
    color: '#334155',
    marginBottom: 12,
  },
  attachmentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -4,
    marginBottom: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#f0f4f8',
  },
  reactionWrap: {
    flex: 1,
  },
  reactionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  reactionText: {
    fontFamily: 'Shark',
    fontSize: 13,
    color: '#0d1b2a',
    textTransform: 'uppercase',
  },
});

// ── Comment Card Wrapper ──────────────────────────────────
function CommentCard({ comment, index, onReplyPress }: { comment: CommentType; index: number; onReplyPress: (c: CommentType) => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    const delay = Math.min(index * 50, 250);
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay, useNativeDriver: true }),
      Animated.timing(slideAnim, { toValue: 0, duration: 300, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        marginHorizontal: 12,
        marginBottom: 8,
        backgroundColor: 'white',
        borderRadius: 14,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 6,
        elevation: 2,
        opacity: fadeAnim,
        transform: [{ translateY: slideAnim }],
      }}
    >
      <Comment comment={comment} onReplyPress={onReplyPress} />
    </Animated.View>
  );
}

// ── Main Screen ───────────────────────────────────────────
export default function ThreadScreen({ route }) {
  const { thread } = route.params;
  const { setActiveComment, reactionTypes } = useContext(ForumContext);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentThread, setCurrentThread] = useState<ThreadType>();
  const [page, setPage] = useState<number>(1);
  const [comments, setComments] = useState<CommentType[]>([]);
  const { player } = useContext(AuthContext);
  const { warnings, labels } = useCrumbs();
  const [activeSort, setActiveSort] = useState<string>('latest');

  const fetchComments = async (p: number) => {
    if (!currentThread) return;
    const response = await getComments(currentThread.id, p, { sort: activeSort });
    setComments((prev) => (p === 1 ? response : [...prev, ...response]));
  };

  const requestThread = async () => {
    try {
      const response = await getThread(thread);
      setCurrentThread(response);
    } catch (error) {
      Alert.alert(warnings.something_went_wrong, labels.please_try_again, [
        { text: 'Go back', onPress: () => RootNavigation.goBack() },
      ]);
    }
  };

  useAsyncEffect(requestThread, []);

  useAsyncEffect(async () => {
    if (!currentThread) return;
    await fetchComments(1);
    setLoading(false);
  }, [currentThread]);

  useAsyncEffect(async () => {
    if (loading) return;
    setComments([]);
    await fetchComments(1);
    setPage(1);
  }, [activeSort]);

  useAsyncEffect(async () => {
    if (page > 1) await fetchComments(page);
  }, [page]);

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton onPress={() => setActiveComment(undefined)} />
        </TopbarColumn>
        <TopbarColumn />
        <TopbarColumn stretch={false}>
          {currentThread && (
            <ThreadActions
              trigger={<FontAwesomeIcon icon={faEllipsis} size={24} color="white" />}
              thread={currentThread}
            />
          )}
        </TopbarColumn>
      </Topbar>

      {loading && <Loading />}
      {!loading && currentThread && (
        <View style={{ flex: 1, backgroundColor: '#f0f4f8' }}>
          <FlashList
            data={comments}
            ListHeaderComponent={
              <>
                <ThreadHeader
                  thread={currentThread}
                  reactionTypes={reactionTypes}
                  player={player}
                  onRefresh={requestThread}
                />
                <SortPills active={activeSort} onSelect={setActiveSort} />
              </>
            }
            renderItem={({ item, index }) => (
              <CommentCard
                comment={item}
                index={index}
                onReplyPress={(comment) => {
                  setActiveComment(comment);
                }}
              />
            )}
            estimatedItemSize={120}
            keyExtractor={(item) => item.id.toString()}
            onEndReached={() => setPage((prev) => prev + 1)}
            contentContainerStyle={{ paddingBottom: player ? 120 : 40 }}
          />
          {player && (
            <CreateReply
              thread={currentThread}
              onSubmit={async () => {
                setComments(await getComments(currentThread.id, 1, { sort: activeSort }));
                setCurrentThread(await getThread(thread));
                setPage(1);
              }}
            />
          )}
        </View>
      )}
    </>
  );
}
