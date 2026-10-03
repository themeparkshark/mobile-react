/**
 * One post in the feed: who and when, a topic badge, big readable text, an
 * optional photo, then the things a kid can do with one tap: react with a
 * shark face, or open the replies. The "..." menu holds report and block.
 */
import { Image } from 'expo-image';
import { memo, useContext } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import Avatar from '../../components/Avatar';
import RichText from '../../components/RichText';
import { AuthContext } from '../../context/AuthProvider';
import { isTeam, TEAMS } from '../../constants/teams';
import type { ThreadType } from '../../models/thread-type';
import { BRAND, GameIcon } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { CommentChip, PressScale, ReactionBar, TopicBadge, card } from './socialLook';
import { timeAgo, timeAgoSpoken, type TopicKey } from './socialModel';
import useReactions from './useReactions';

function ThreadCard({
  thread,
  index,
  fresh,
  onOpen,
  onMenu,
  onTopic,
}: {
  readonly thread: ThreadType;
  readonly index: number;
  /** Just posted by me: a gold glow so the kid sees it landed. */
  readonly fresh?: boolean;
  readonly onOpen: (thread: ThreadType) => void;
  readonly onMenu: (thread: ThreadType) => void;
  readonly onTopic?: (topic: TopicKey) => void;
}) {
  const { player } = useContext(AuthContext);
  const reduced = useUiReducedMotion();
  const { state, toggle, offered, extra } = useReactions(thread, Boolean(player));
  const name = thread.player?.screen_name ?? 'Shark fan';
  const pinned = Boolean(thread.pinned_at);
  const team = isTeam(thread.team) ? TEAMS[thread.team] : null;
  const text = thread.content || thread.title;
  const photo = thread.attachments?.[0]?.path;

  return (
    <Animated.View
      entering={reduced || index > 6 ? undefined : FadeInDown.delay(Math.min(index, 6) * 50).springify().damping(16)}
      style={styles.wrap}
    >
      <View style={[card.shell, fresh && styles.fresh, pinned && styles.pinned]}>
        <PressScale
          onPress={() => onOpen(thread)}
          scaleTo={0.98}
          accessibilityLabel={`${name}, ${timeAgoSpoken(thread.created_at)}. ${text}`}
          accessibilityHint="Opens the post and its replies"
          style={styles.body}
        >
          {(pinned || team) && (
            <View style={styles.flags}>
              {pinned && (
                <View style={[styles.flag, { backgroundColor: '#fff1c2', borderColor: BRAND.gold }]}>
                  <GameIcon name="pin" size={16} />
                  <Text style={styles.flagText}>From the Shark team</Text>
                </View>
              )}
              {team && (
                <View style={[styles.flag, { backgroundColor: `${team.color}22`, borderColor: team.color }]}>
                  <Image source={team.badge} style={{ width: 16, height: 16 }} contentFit="contain" />
                  <Text style={styles.flagText}>{team.name} only</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.author}>
            <Avatar player={thread.player} size="sm" />
            <View style={{ flex: 1, gap: 3 }}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              <View style={styles.meta}>
                <Text style={styles.time}>{timeAgo(thread.created_at)}</Text>
                <TopicBadge topic={thread.topic} onPress={onTopic && thread.topic ? () => onTopic(thread.topic as TopicKey) : undefined} />
              </View>
            </View>
          </View>

          <RichText style={styles.text} numberOfLines={6}>{text}</RichText>

          {photo ? <Image source={photo} recyclingKey={`t${thread.id}`} style={styles.photo} contentFit="cover" transition={150} /> : null}
        </PressScale>

        <View style={styles.actions}>
          <View style={{ flex: 1 }}>
            <ReactionBar state={state} types={offered} extraTypes={extra} onToggle={toggle} disabled={!player} size={26} />
          </View>
          <CommentChip count={thread.comments_count ?? 0} onPress={() => onOpen(thread)} label={false} />
        </View>

        {player && (
          <PressScale
            onPress={() => onMenu(thread)}
            style={styles.more}
            hitSlop={10}
            accessibilityLabel={`More for ${name}'s post`}
            accessibilityHint="Report, block or delete"
          >
            <View style={styles.dot} />
            <View style={styles.dot} />
            <View style={styles.dot} />
          </PressScale>
        )}
      </View>
    </Animated.View>
  );
}

export default memo(ThreadCard);

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingBottom: 14 },
  fresh: { borderColor: BRAND.gold, shadowColor: BRAND.gold, shadowOpacity: 0.8, shadowRadius: 14 },
  pinned: { backgroundColor: '#fffdf4' },
  body: { padding: 14, paddingBottom: 6 },
  flags: { flexDirection: 'row', gap: 6, marginBottom: 8, paddingRight: 40 },
  flag: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 2, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  flagText: { fontFamily: 'Shark', fontSize: 12, color: BRAND.navy, marginTop: 2 },
  author: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8, paddingRight: 36 },
  name: { fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, marginTop: 2 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  time: { fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft },
  text: { fontFamily: 'Knockout', fontSize: 21, lineHeight: 26, color: '#10233f' },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 16, marginTop: 10, backgroundColor: '#dbefff' },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderTopWidth: 2,
    borderTopColor: '#e3eefb',
  },
  more: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 44,
    height: 44,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BRAND.navySoft },
});
