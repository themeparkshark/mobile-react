/**
 * One bell row (Social v2). A coloured badge tells a kid what it is before
 * they read a word: purple shark = someone wants to be friends, green tick =
 * new friend, orange heart = a heart and coins, gold coin = park coins, red
 * gift = a prize, blue bell = news. Friend requests answer right here with
 * Yes! / No. Tap the row to go where it points; press and hold to clear it.
 *
 * Pure and memoized: read state comes from the screen (FlashList recycles
 * rows, so a row must never keep its own copy), and only a row whose item,
 * read state or friend answer changed re-renders.
 */
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { useFriendActions } from '../hooks/useFriends';
import type { NotificationType } from '../models/notification-type';
import { actorOf, canAnswerInline, kidMessage, kindOf, KIND_LOOK, shortAgo, spokenAgo, type FriendStatus } from '../screens/social/socialModel';
import { INK, Pill, kit, useSquash } from '../screens/social/SocialKit';
import { BRAND, FONT, GameIcon, GameRichText } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { notificationMessage } from './notificationCopy';

export const NOTIFICATION_ROW_HEIGHT = 104;

interface Props {
  readonly notification: NotificationType;
  readonly unread: boolean;
  /** The local friend answer for this row's player, if any. */
  readonly answer: FriendStatus | undefined;
  readonly onOpen: (notification: NotificationType) => void;
  readonly onClear: (notification: NotificationType) => void;
  readonly onAnswered: (notification: NotificationType) => void;
}

function Notification({ notification, unread, answer, onOpen, onClear, onAnswered }: Props) {
  const kind = kindOf(notification);
  const actor = actorOf(notification);
  const reduced = useUiReducedMotion();
  const squash = useSquash();
  const actions = useFriendActions();
  const [artFailed, setArtFailed] = useState(false);
  const overrides = new Map(answer && actor ? [[actor, answer]] : []);
  const answerable = canAnswerInline(notification, overrides);
  const answeredYes = kind === 'friend_request' && answer === 'friends';
  const answeredNo = kind === 'friend_request' && answer === 'none';
  // A request answered Yes turns into a "new friend" row right where it is.
  const look = KIND_LOOK[answeredYes ? 'friend_accepted' : kind];
  const stored = notificationMessage(notification.content?.message);
  const message = kidMessage(notification, stored);
  const excerpt = notification.content?.excerpt;
  const hasRoute = !!notification.content?.route?.screen;
  const storedArt = notification.content?.image ?? null;
  const art = artFailed ? null : answeredYes && storedArt ? storedArt.replace('friend_request_received', 'friend_request_accepted') : storedArt;
  // The row only offers Yes/No while the request waits, so the answer starts from 'incoming'.
  const target = actor ? { id: actor, screen_name: nameFrom(stored), friend_status: 'incoming' as const } : null;

  return (
    <View style={styles.wrap}>
      <View style={[kit.card, styles.card, unread ? styles.cardUnread : styles.cardRead]}>
        {unread && <View style={[styles.stripe, { backgroundColor: look.color }]} />}
        <Pressable
          onPress={() => onOpen(notification)}
          onLongPress={() => onClear(notification)}
          delayLongPress={450}
          onPressIn={squash.onPressIn}
          onPressOut={squash.onPressOut}
          accessibilityRole="button"
          accessibilityLabel={`${unread ? 'New. ' : ''}${look.spoken}. ${message}${excerpt ? `. "${excerpt}"` : ''}. ${spokenAgo(notification.created_at)}`}
          accessibilityHint={hasRoute ? 'Opens it. Press and hold to clear.' : 'Press and hold to clear.'}
          accessibilityActions={[{ name: 'clear', label: 'Clear' }]}
          onAccessibilityAction={event => { if (event.nativeEvent.actionName === 'clear') onClear(notification); }}
        >
          <Animated.View style={[styles.row, squash.style]}>
            <View style={[styles.badge, { backgroundColor: look.color, borderBottomColor: look.lip }]}>
              {art
                ? <Image source={{ uri: art }} style={styles.badgeArt} contentFit="cover" onError={() => setArtFailed(true)} recyclingKey={`${notification.id}-${answeredYes}`} transition={120} />
                : <GameIcon name={look.icon} size={34} />}
            </View>
            <View style={styles.body}>
              <GameRichText preset="bodySmall" style={[styles.message, !unread && styles.messageRead]} iconSize={17} numberOfLines={3}>
                {message}
              </GameRichText>
              {!!excerpt && <Text style={styles.excerpt} numberOfLines={1} maxFontSizeMultiplier={1.3}>"{excerpt}"</Text>}
              <View style={styles.metaRow}>
                <View style={[styles.timeChip, unread && { backgroundColor: look.color }]}>
                  <Text style={[styles.time, unread && styles.timeUnread]} maxFontSizeMultiplier={1.2}>{shortAgo(notification.created_at)}</Text>
                </View>
              </View>
            </View>
            {hasRoute && !answerable && (
              <View style={styles.chevron} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <GameIcon name="arrow" size={24} />
              </View>
            )}
          </Animated.View>
        </Pressable>
        {answerable && target && (
          <Animated.View entering={reduced ? undefined : FadeIn} style={styles.answer}>
            <Pill compact tone="grey" icon="close" label="No" accessibilityLabel={`Say no to ${target.screen_name}`}
              onPress={async () => { if (await actions.decline(target)) onAnswered(notification); }} style={{ flex: 1 }} />
            <Pill compact tone="green" icon="check" label="Yes!" accessibilityLabel={`Say yes to ${target.screen_name}`}
              onPress={async () => { if (await actions.accept(target)) onAnswered(notification); }} style={{ flex: 2 }} />
          </Animated.View>
        )}
        {(answeredYes || answeredNo) && (
          <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(12)} style={styles.answered} accessibilityLiveRegion="polite">
            <GameIcon name={answeredYes ? 'sparkle' : 'close'} size={22} />
            <Text style={[styles.answeredText, answeredYes && { color: BRAND.greenLip }]} maxFontSizeMultiplier={1.2}>
              {answeredYes ? "You're friends now!" : 'OK, not now'}
            </Text>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

/** "BubbleBuddy has sent you a friend request." -> "BubbleBuddy" (for button labels). */
export function nameFrom(message: string): string {
  const match = /^(\S+)\s/.exec(message.trim());
  return match ? match[1] : 'them';
}

export default memo(Notification, (a, b) => a.notification === b.notification && a.unread === b.unread && a.answer === b.answer
  && a.onOpen === b.onOpen && a.onClear === b.onClear && a.onAnswered === b.onAnswered);

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingBottom: 10 },
  card: { paddingRight: 8 },
  cardUnread: { backgroundColor: '#FFF8E4' },
  cardRead: { backgroundColor: 'rgba(255,255,255,0.92)', borderColor: '#3D5F8C', borderBottomWidth: 4 },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 7 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 16, minHeight: 84 },
  badge: {
    width: 58, height: 58, borderRadius: 29, borderWidth: 3, borderBottomWidth: 5, borderColor: INK,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  badgeArt: { width: '100%', height: '100%' },
  body: { flex: 1, marginLeft: 12, marginRight: 4 },
  message: { fontSize: 17, lineHeight: 21, color: INK },
  messageRead: { color: BRAND.navySoft },
  excerpt: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft, marginTop: 2 },
  metaRow: { flexDirection: 'row', marginTop: 6 },
  timeChip: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, backgroundColor: '#E6EEF7' },
  time: { fontFamily: FONT.display, fontSize: 14, color: BRAND.navySoft, includeFontPadding: false },
  timeUnread: { color: '#FFFFFF' },
  chevron: { width: 32, alignItems: 'center' },
  answer: { flexDirection: 'row', gap: 10, paddingLeft: 86, paddingRight: 6, paddingBottom: 12 },
  answered: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 86, paddingBottom: 12 },
  answeredText: { fontFamily: FONT.display, fontSize: 17, color: BRAND.navySoft, textTransform: 'uppercase' },
});
