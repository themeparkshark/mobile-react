/**
 * One post and its replies. The single detail view for feed taps, deep links
 * from notifications and the post you just made (there used to be two: a
 * bottom sheet in the feed and this screen, each with its own bugs).
 *
 * Reads like a chat: the post on top, replies oldest first in bubbles, a
 * reply bar pinned above the keyboard. A reply to a reply stays in the same
 * bubble group. Opens instantly from the feed's copy of the post and then
 * refreshes. Hidden replies (removed, deleted, blocked) keep their place
 * only when someone answered them, and never show their words.
 */
import type { ParamListBase } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchComments, fetchReplies, fetchThread, postComment } from '../api/endpoints/social';
import AttachmentModal from '../components/AttachmentModal';
import Avatar from '../components/Avatar';
import RichText from '../components/RichText';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import { isTeam, TEAMS } from '../constants/teams';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import * as Haptics from '../helpers/haptics';
import type { CommentType } from '../models/comment-type';
import type { ThreadType } from '../models/thread-type';
import * as RootNavigation from '../RootNavigation';
import { BRAND, GameIcon, SharkLoader } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import Composer from './threads/Composer';
import PostMenu, { type MenuTarget } from './threads/PostMenu';
import { emitSocial } from './threads/socialEvents';
import { CommentChip, OfficialAvatar, OfficialName, PressScale, ReactionBar, TopicBadge, WATER, card } from './threads/socialLook';
import { DRAFT_LINES, QUICK_REPLIES, REPLY_MAX, checkDraft, errorLine, mergePage, timeAgo, timeAgoSpoken } from './threads/socialModel';
import { PROD_DRAFT_LINES, PROD_MIN_CHARS, postText, prodCheckDraft } from './threads/prodCompat';
import useReactions from './threads/useReactions';
import useKeyboardInset from './threads/useKeyboardInset';
import { buildRows, hiddenLine, type Row } from './threads/socialRows';

const SEND = require('../../assets/sounds/whoosh.mp3');
const NOPE = require('../../assets/sounds/nope.mp3');

function Bubble({
  comment,
  depth,
  mine,
  highlight,
  onReply,
  onMenu,
}: {
  readonly comment: CommentType;
  readonly depth: 0 | 1;
  readonly mine: boolean;
  readonly highlight: boolean;
  readonly onReply: (comment: CommentType) => void;
  readonly onMenu: (comment: CommentType) => void;
}) {
  const reduced = useUiReducedMotion();
  const hidden = Boolean(comment.hidden || (!comment.content && (comment.deleted_at || comment.removed_at)));
  const name = comment.player?.screen_name ?? 'Shark fan';

  if (hidden) {
    return (
      <View style={[styles.bubbleRow, depth === 1 && styles.indent]}>
        <View style={styles.ghost}><Text style={styles.ghostText}>{hiddenLine(comment)}</Text></View>
      </View>
    );
  }

  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.springify().damping(16)} style={[styles.bubbleRow, depth === 1 && styles.indent]}>
      <PressScale
        onPress={() => comment.player && RootNavigation.navigate('Player', { player: comment.player.id })}
        accessibilityLabel={`${name}'s profile`}
        style={styles.miniAvatar}
      >
        <View style={styles.avatarScale}><Avatar player={comment.player as ThreadType["player"]} size="sm" /></View>
      </PressScale>
      <View style={{ flex: 1 }}>
        <View
          style={[styles.bubble, mine && styles.bubbleMine, highlight && styles.bubbleHighlight]}
          accessible
          accessibilityLabel={`${name}, ${timeAgoSpoken(comment.created_at)}: ${comment.content ?? ''}`}
        >
          <View style={styles.bubbleHead}>
            <Text style={styles.bubbleName} numberOfLines={1}>{mine ? 'You' : name}</Text>
            <Text style={styles.bubbleTime}>{timeAgo(comment.created_at)}</Text>
          </View>
          <RichText style={styles.bubbleText}>{comment.content ?? ''}</RichText>
        </View>
        <View style={styles.bubbleActions}>
          <PressScale onPress={() => onReply(comment)} style={styles.smallAction} accessibilityLabel={`Reply to ${name}`} hitSlop={6}>
            <Text style={styles.smallActionText}>Reply</Text>
          </PressScale>
          <PressScale onPress={() => onMenu(comment)} style={styles.smallAction} accessibilityLabel={mine ? 'Delete my reply' : `Report or block ${name}`} hitSlop={6}>
            <View style={styles.dotRow}><View style={styles.dot} /><View style={styles.dot} /><View style={styles.dot} /></View>
          </PressScale>
        </View>
      </View>
    </Animated.View>
  );
}

function PostHeader({ thread, onMenu, onEdit }: { readonly thread: ThreadType; readonly onMenu: () => void; readonly onEdit?: () => void }) {
  const { player } = useContext(AuthContext);
  const { state, toggle, offered, extra } = useReactions(thread, Boolean(player));
  const team = isTeam(thread.team) ? TEAMS[thread.team] : null;
  const official = Boolean(thread.is_official);
  const name = official ? 'Theme Park Shark' : thread.player?.screen_name ?? 'Shark fan';
  return (
    <View style={[card.shell, styles.post]}>
      <View style={styles.postHead}>
        {official ? (
          <OfficialAvatar size={60} />
        ) : (
          <PressScale onPress={() => thread.player && RootNavigation.navigate('Player', { player: thread.player.id })} accessibilityLabel={`${name}'s profile`}>
            <Avatar player={thread.player} size="md" />
          </PressScale>
        )}
        <View style={{ flex: 1, gap: 4 }}>
          {official ? <OfficialName size={20} /> : <Text style={styles.postName} numberOfLines={1}>{name}</Text>}
          <View style={styles.postMeta}>
            <Text style={styles.postTime}>{timeAgo(thread.created_at)}</Text>
            <TopicBadge topic={thread.topic} size="md" />
            {team && (
              <View style={[styles.teamFlag, { borderColor: team.color, backgroundColor: `${team.color}22` }]}>
                <Image source={team.badge} style={{ width: 16, height: 16 }} contentFit="contain" />
                <Text style={styles.teamFlagText}>{team.name}</Text>
              </View>
            )}
          </View>
        </View>
        {player && (
          <PressScale onPress={onMenu} style={styles.more} hitSlop={8} accessibilityLabel="More" accessibilityHint={onEdit ? 'Edit or delete' : 'Report or block'}>
            <View style={styles.dotRow}><View style={styles.dotBig} /><View style={styles.dotBig} /><View style={styles.dotBig} /></View>
          </PressScale>
        )}
      </View>
      <RichText style={styles.postText}>{postText(thread)}</RichText>
      {thread.attachments?.length > 0 && (
        <View style={styles.photos}>
          {thread.attachments.map((attachment) => (
            <View key={attachment.id} style={{ width: thread.attachments.length > 1 ? '50%' : '100%', padding: 3 }}>
              <AttachmentModal attachment={attachment} />
            </View>
          ))}
        </View>
      )}
      <View style={styles.postActions}>
        <View style={{ flex: 1 }}>
          <ReactionBar state={state} types={offered} extraTypes={extra} onToggle={toggle} disabled={!player} size={32} />
        </View>
      </View>
    </View>
  );
}

export default function ThreadScreen({ route }: NativeStackScreenProps<ParamListBase, 'Thread'>) {
  const params = (route.params ?? {}) as { thread: number; preview?: ThreadType; comment?: number };
  const threadId = Number(params.thread);
  const insets = useSafeAreaInsets();
  const reduced = useUiReducedMotion();
  const { height: windowHeight } = useWindowDimensions();
  const keyboard = useKeyboardInset(windowHeight, reduced);
  const { player } = useContext(AuthContext);
  const { playSound } = useContext(SoundEffectContext);

  const [thread, setThread] = useState<ThreadType | null>(params.preview ?? null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error' | 'gone'>(params.preview ? 'ready' : 'loading');
  const [comments, setComments] = useState<CommentType[]>([]);
  const [commentsState, setCommentsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [extraReplies, setExtraReplies] = useState<Record<number, CommentType[]>>({});
  const [replyTo, setReplyTo] = useState<CommentType | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [editing, setEditing] = useState(false);
  const [highlight, setHighlight] = useState<number | null>(params.comment ?? null);
  const inputRef = useRef<TextInput>(null);
  const listRef = useRef<FlashList<Row>>(null);

  const loadThread = useCallback(async () => {
    try {
      const fresh = await fetchThread(threadId);
      setThread(fresh);
      setStatus('ready');
      emitSocial({ type: 'thread-updated', thread: { id: fresh.id, comments_count: fresh.comments_count } });
    } catch (error) {
      const code = (error as { response?: { status?: number } })?.response?.status;
      setStatus(code === 404 ? 'gone' : (current) => (current === 'ready' ? 'ready' : 'error'));
      if (code === 404) emitSocial({ type: 'thread-gone', id: threadId });
    }
  }, [threadId]);

  const loadingPage = useRef<number | null>(null);
  const loadComments = useCallback(async (nextPage: number) => {
    // Fast scrolling fires onEndReached many times: one request per page.
    if (loadingPage.current === nextPage) return;
    loadingPage.current = nextPage;
    try {
      const result = await fetchComments(threadId, nextPage, 'oldest');
      setComments((current) => mergePage(current, result.data, nextPage));
      setHasMore(result.hasMore);
      setPage(nextPage);
      setCommentsState('ready');
    } catch {
      if (nextPage === 1) setCommentsState('error');
    } finally {
      loadingPage.current = null;
    }
  }, [threadId]);

  useEffect(() => {
    void loadThread();
    void loadComments(1);
  }, [loadThread, loadComments]);

  const rows = useMemo(() => buildRows(comments, extraReplies), [comments, extraReplies]);

  // From a notification: scroll to the reply and glow it.
  useEffect(() => {
    if (!highlight || commentsState !== 'ready') return;
    const index = rows.findIndex((row) => row.kind === 'comment' && row.comment.id === highlight);
    if (index >= 0) setTimeout(() => listRef.current?.scrollToIndex({ index, animated: !reduced, viewPosition: 0.4 }), 250);
    const id = setTimeout(() => setHighlight(null), 3500);
    return () => clearTimeout(id);
  }, [highlight, commentsState]); // eslint-disable-line react-hooks/exhaustive-deps

  const moreReplies = async (topId: number) => {
    const have = (comments.find((c) => c.id === topId)?.children?.length ?? 0) + (extraReplies[topId]?.length ?? 0);
    try {
      const nextPage = Math.floor(have / 15) + 1;
      const result = await fetchReplies(topId, nextPage);
      setExtraReplies((current) => ({ ...current, [topId]: [...(current[topId] ?? []), ...result.data] }));
    } catch {
      // The button stays; a second tap tries again.
    }
  };

  const startReply = (comment: CommentType) => {
    setReplyTo(comment);
    setLine(null);
    inputRef.current?.focus();
  };

  /** Send the typed reply, or a one-tap quick reply (fixed kind phrases, nothing to filter). */
  const send = async (quick?: string) => {
    if (!thread || sending) return;
    const words = (quick ?? text).trim();
    const problem = prodCheckDraft(words, REPLY_MAX);
    if (problem) {
      setLine(problem === 'empty' ? null : PROD_DRAFT_LINES[problem]);
      playSound(NOPE, { volume: 0.5 });
      void Haptics.notificationAsync('warning');
      if (problem === 'empty') inputRef.current?.focus();
      return;
    }
    setSending(true);
    setLine(null);
    // Display stays one level deep (a reply to a reply joins its group), but the
    // notification goes to the kid who was actually answered.
    const parent = replyTo ? (replyTo.parent_id ?? replyTo.id) : null;
    const answered = replyTo && replyTo.parent_id ? replyTo.id : null;
    try {
      const created = await postComment(thread.id, words, parent, answered);
      playSound(SEND, { volume: 0.6 });
      void Haptics.notificationAsync('success');
      const mineCreated: CommentType = { ...created, player: created.player ?? (player as CommentType['player']), children: created.children ?? [], children_count: 0 };
      // Trust where the server put it (a retried send returns the reply already saved).
      const group = created.parent_id ?? parent;
      const already = comments.some((c) => c.id === created.id || (c.children ?? []).some((k) => k.id === created.id))
        || Object.values(extraReplies).some((list) => list.some((k) => k.id === created.id));
      if (!already) {
        if (group) {
          setExtraReplies((current) => ({ ...current, [group]: [...(current[group] ?? []), mineCreated] }));
          setComments((current) => current.map((c) => (c.id === group ? { ...c, children_count: (c.children_count ?? 0) + 1 } : c)));
        } else {
          setComments((current) => [...current, mineCreated]);
        }
        setThread((current) => (current ? { ...current, comments_count: (current.comments_count ?? 0) + 1 } : current));
        emitSocial({ type: 'replies-changed', id: thread.id, delta: 1 });
      }
      if (!quick) setText('');
      setReplyTo(null);
      setHighlight(created.id);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: !reduced }), 120);
    } catch (error) {
      setLine(errorLine(error));
      playSound(NOPE, { volume: 0.5 });
      void Haptics.notificationAsync('error');
    } finally {
      setSending(false);
    }
  };

  const openPostMenu = () => {
    if (!thread) return;
    const official = Boolean(thread.is_official);
    setMenu({
      kind: 'thread',
      id: thread.id,
      // Theme Park Shark's own posts can be reported but not blocked.
      authorId: official ? null : thread.player?.id ?? null,
      authorName: official ? 'Theme Park Shark' : thread.player?.screen_name ?? 'this player',
      mine: !official && thread.player?.id === player?.id,
    });
  };

  const openCommentMenu = (comment: CommentType) => {
    setMenu({ kind: 'comment', id: comment.id, authorId: comment.player?.id ?? null, authorName: comment.player?.screen_name ?? 'this player', mine: comment.player?.id === player?.id });
  };

  const draftProblem = checkDraft(text, REPLY_MAX);
  const replyName = replyTo?.player?.screen_name;

  if (status === 'gone') {
    return (
      <View style={styles.root}>
        <Topbar><TopbarColumn stretch={false}><BackButton /></TopbarColumn><TopbarColumn><TopbarText>Post</TopbarText></TopbarColumn><TopbarColumn stretch={false} /></Topbar>
        <Image source={WATER} style={StyleSheet.absoluteFill} contentFit="cover" />
        <SharkLoader state="empty" tone="onBlue" title="This post is gone" message="It was deleted or hidden." action={{ label: 'Back to Social', onPress: () => RootNavigation.goBack() }} style={{ marginTop: 120, paddingHorizontal: 24 }} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <Topbar>
        <TopbarColumn stretch={false}><BackButton /></TopbarColumn>
        <TopbarColumn><TopbarText>Post</TopbarText></TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <View style={{ flex: 1 }}>
        <Image source={WATER} style={StyleSheet.absoluteFill} contentFit="cover" />
        {/* The body reaches the bottom of the window, so the keyboard's own height is the exact padding. */}
        <View style={{ flex: 1, paddingBottom: keyboard }}>
          {!thread ? (
            <SharkLoader state={status === 'error' ? 'error' : 'loading'} tone="onBlue" onRetry={() => { setStatus('loading'); void loadThread(); void loadComments(1); }} style={{ marginTop: 80 }} />
          ) : (
            <FlashList
              ref={listRef}
              data={rows}
              keyExtractor={(row) => row.key}
              getItemType={(row) => row.kind}
              estimatedItemSize={96}
              extraData={highlight}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              contentContainerStyle={{ paddingTop: 12, paddingBottom: 16 }}
              ListHeaderComponent={
                <View>
                  <PostHeader thread={thread} onMenu={openPostMenu} onEdit={thread.player?.id === player?.id ? () => setEditing(true) : undefined} />
                  <View style={styles.repliesHead}>
                    <CommentChip count={thread.comments_count ?? 0} />
                  </View>
                </View>
              }
              ListEmptyComponent={
                commentsState === 'loading' ? <SharkLoader compact tone="onBlue" style={{ marginTop: 16 }} />
                  : commentsState === 'error' ? <SharkLoader compact state="error" tone="onBlue" onRetry={() => { setCommentsState('loading'); void loadComments(1); }} style={{ marginTop: 16 }} />
                    : (
                      <View style={styles.noReplies}>
                        <Text style={styles.noRepliesTitle}>No replies yet</Text>
                        <Text style={styles.noRepliesLine}>Say something nice!</Text>
                      </View>
                    )
              }
              renderItem={({ item }) => item.kind === 'more' ? (
                <PressScale onPress={() => void moreReplies(item.topId)} style={styles.moreReplies} accessibilityLabel={`Show ${item.remaining} more replies`}>
                  <Text style={styles.moreRepliesText}>Show {item.remaining} more {item.remaining === 1 ? 'reply' : 'replies'}</Text>
                </PressScale>
              ) : (
                <Bubble
                  comment={item.comment}
                  depth={item.depth}
                  mine={item.comment.player?.id === player?.id}
                  highlight={item.comment.id === highlight}
                  onReply={startReply}
                  onMenu={openCommentMenu}
                />
              )}
              onEndReached={() => { if (hasMore) void loadComments(page + 1); }}
              onEndReachedThreshold={0.5}
            />
          )}

          {player && thread ? (
            <View style={[styles.replyBar, { paddingBottom: keyboard > 0 ? 8 : Math.max(insets.bottom, 10) }]}>
              {(replyTo || line) && (
                <Animated.View entering={reduced ? undefined : FadeIn} exiting={reduced ? undefined : FadeOut} style={styles.replyInfo}>
                  {line ? (
                    <>
                      <GameIcon name="info" size={18} />
                      <Text style={styles.replyLine} accessibilityLiveRegion="polite">{line}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={styles.replyingTo} numberOfLines={1}>Replying to {replyName ?? 'a reply'}</Text>
                      <PressScale onPress={() => setReplyTo(null)} accessibilityLabel="Stop replying" hitSlop={10}>
                        <GameIcon name="close" size={24} />
                      </PressScale>
                    </>
                  )}
                </Animated.View>
              )}
              {!text.trim() && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={styles.quickRow}
                  accessibilityLabel="Quick replies"
                >
                  {QUICK_REPLIES.filter((phrase) => phrase.length >= PROD_MIN_CHARS).map((phrase) => (
                    <PressScale
                      key={phrase}
                      onPress={() => void send(phrase)}
                      disabled={sending}
                      scaleTo={0.9}
                      haptic="medium"
                      style={styles.quick}
                      accessibilityLabel={`Reply ${phrase}`}
                    >
                      <Text style={styles.quickText}>{phrase}</Text>
                    </PressScale>
                  ))}
                </ScrollView>
              )}
              <View style={styles.replyRow}>
                <TextInput
                  ref={inputRef}
                  value={text}
                  onChangeText={(value) => { setText(value); setLine(null); }}
                  placeholder={replyName ? `Reply to ${replyName}` : 'Say something nice!'}
                  placeholderTextColor="#7d95b5"
                  multiline
                  maxLength={REPLY_MAX + 20}
                  style={styles.replyInput}
                  accessibilityLabel="Your reply"
                />
                <PressScale
                  onPress={() => void send()}
                  disabled={sending}
                  haptic="medium"
                  scaleTo={0.88}
                  accessibilityLabel="Send reply"
                  accessibilityState={{ disabled: Boolean(draftProblem) || sending }}
                  style={[styles.send, (draftProblem === 'empty' || sending) && styles.sendOff]}
                >
                  <GameIcon name="arrow" size={30} />
                </PressScale>
              </View>
            </View>
          ) : null}
        </View>
      </View>

      <PostMenu
        target={menu}
        onClose={() => setMenu(null)}
        onEdit={() => setEditing(true)}
        onGone={(why, target) => {
          if (target.kind === 'thread' || why === 'blocked' && target.authorId === thread?.player?.id) {
            if (why === 'blocked' && target.authorId) emitSocial({ type: 'player-blocked', playerId: target.authorId });
            else emitSocial({ type: 'thread-gone', id: target.id });
            RootNavigation.goBack();
            return;
          }
          if (why === 'blocked' && target.authorId) {
            const drop = (list: CommentType[]): CommentType[] => list.filter((c) => c.player?.id !== target.authorId).map((c) => ({ ...c, children: drop(c.children ?? []) }));
            setComments(drop);
            setExtraReplies((current) => Object.fromEntries(Object.entries(current).map(([k, v]) => [k, drop(v)])));
            emitSocial({ type: 'player-blocked', playerId: target.authorId });
            return;
          }
          // A reply that others answered keeps its place as a placeholder, like the server does.
          const hide = (list: CommentType[]): CommentType[] => list
            .filter((c) => c.id !== target.id || (c.children_count ?? 0) > 0)
            .map((c) => (c.id === target.id
              ? { ...c, content: null, player: null, hidden: why === 'deleted' ? 'deleted' : 'reported' }
              : { ...c, children: hide(c.children ?? []) }));
          setComments(hide);
          setExtraReplies((current) => Object.fromEntries(Object.entries(current).map(([k, v]) => [k, hide(v)])));
          if (why === 'deleted') {
            setThread((current) => (current ? { ...current, comments_count: Math.max(0, (current.comments_count ?? 1) - 1) } : current));
            emitSocial({ type: 'replies-changed', id: threadId, delta: -1 });
          }
        }}
      />

      {thread && (
        <Composer
          visible={editing}
          editing={thread}
          onClose={() => setEditing(false)}
          onPosted={(updated) => {
            setEditing(false);
            setThread((current) => (current ? { ...current, ...updated, player: current.player } : current));
            emitSocial({ type: 'thread-updated', thread: { id: updated.id, content: updated.content, title: updated.title } });
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: BRAND.blue },
  post: { marginHorizontal: 14, padding: 14 },
  postHead: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  postName: { fontFamily: 'Shark', fontSize: 20, color: BRAND.navy, marginTop: 2 },
  postMeta: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  postTime: { fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft },
  teamFlag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 },
  teamFlagText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.navy, marginTop: 2 },
  postText: { fontFamily: 'Knockout', fontSize: 24, lineHeight: 30, color: '#10233f' },
  photos: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -3, marginTop: 10 },
  postActions: { flexDirection: 'row', alignItems: 'center', marginTop: 10, paddingTop: 8, borderTopWidth: 2, borderTopColor: '#e3eefb' },
  more: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  dotRow: { flexDirection: 'row', gap: 4, alignItems: 'center' },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: BRAND.white },
  dotBig: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.navySoft },
  repliesHead: { flexDirection: 'row', marginHorizontal: 14, marginTop: 14, marginBottom: 8 },
  noReplies: { alignItems: 'center', marginTop: 18, gap: 2 },
  noRepliesTitle: { fontFamily: 'Shark', fontSize: 22, color: BRAND.white, textShadowColor: BRAND.navy, textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  noRepliesLine: { fontFamily: 'Knockout', fontSize: 18, color: '#dbefff' },
  bubbleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 14, paddingVertical: 4 },
  indent: { paddingLeft: 52 },
  miniAvatar: { width: 38, height: 38, borderRadius: 19, overflow: 'hidden', marginTop: 4 },
  avatarScale: { width: 50, height: 50, transform: [{ scale: 0.76 }], marginLeft: -6, marginTop: -6 },
  bubble: { backgroundColor: BRAND.white, borderRadius: 18, borderTopLeftRadius: 6, borderWidth: 2, borderColor: '#bcd8f5', paddingHorizontal: 12, paddingVertical: 8 },
  bubbleMine: { backgroundColor: '#fff8e4', borderColor: '#f0d488' },
  bubbleHighlight: { borderColor: BRAND.gold, borderWidth: 3 },
  bubbleHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 2 },
  bubbleName: { flexShrink: 1, fontFamily: 'Shark', fontSize: 15, color: BRAND.navy, marginTop: 2 },
  bubbleTime: { fontFamily: 'Knockout', fontSize: 14, color: BRAND.navySoft },
  bubbleText: { fontFamily: 'Knockout', fontSize: 19, lineHeight: 24, color: '#10233f' },
  bubbleActions: { flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4 },
  smallAction: { minHeight: 44, minWidth: 48, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, marginTop: 4, borderRadius: 999, backgroundColor: 'rgba(5,52,110,0.5)' },
  smallActionText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white, marginTop: 2 },
  ghost: { flex: 1, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(255,255,255,0.5)', paddingHorizontal: 12, paddingVertical: 8 },
  ghostText: { fontFamily: 'Knockout', fontSize: 16, color: '#dbefff' },
  moreReplies: { marginLeft: 66, marginVertical: 4, alignSelf: 'flex-start', backgroundColor: 'rgba(5,52,110,0.55)', borderRadius: 999, paddingHorizontal: 14, minHeight: 40, justifyContent: 'center' },
  moreRepliesText: { fontFamily: 'Shark', fontSize: 14, color: BRAND.white, marginTop: 2 },
  replyBar: { backgroundColor: BRAND.cream, borderTopWidth: 3, borderTopColor: BRAND.navy, paddingHorizontal: 10, paddingTop: 8, gap: 6 },
  replyInfo: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 6 },
  replyLine: { flex: 1, fontFamily: 'Knockout', fontSize: 16, color: BRAND.redLip },
  replyingTo: { flex: 1, fontFamily: 'Shark', fontSize: 14, color: BRAND.navySoft, marginTop: 2 },
  replyRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  quickRow: { gap: 8, paddingHorizontal: 2, paddingBottom: 2 },
  quick: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: BRAND.white,
    borderWidth: 2,
    borderBottomWidth: 4,
    borderColor: '#0a4f9c',
  },
  quickText: { fontFamily: 'Shark', fontSize: 16, color: BRAND.navy, marginTop: 3 },
  replyInput: {
    flex: 1,
    fontFamily: 'Knockout',
    fontSize: 20,
    color: '#10233f',
    backgroundColor: BRAND.white,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: '#bcd8f5',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    minHeight: 48,
    maxHeight: 120,
  },
  send: { width: 52, height: 52, borderRadius: 26, backgroundColor: BRAND.gold, borderWidth: 3, borderBottomWidth: 5, borderColor: '#7a3d00', alignItems: 'center', justifyContent: 'center' },
  sendOff: { opacity: 0.5 },
});
