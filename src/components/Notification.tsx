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
import { memo, useCallback, useContext, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn, useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { useFriendActions } from '../hooks/useFriends';
import { DEFAULT_PORTRAIT } from './Avatar';
import type { NotificationType } from '../models/notification-type';
import { actorOf, canAnswerInline, kidMessage, kindOf, KIND_LOOK, leadName, rewardCoins, shortAgo, spokenAgo, type FriendStatus, type NotificationKind } from '../screens/social/socialModel';
import { INK, Pill, kit, useSquash } from '../screens/social/SocialKit';
import { Burst, useHop } from '../screens/social/SocialFx';
import { SurfaceContext, takeJustFriended } from '../screens/social/socialStore';
import { BRAND, FONT, GameIcon, GameRichText } from '../ui';
import { BADGE_ART } from './notificationBadgeArt';
import useUiReducedMotion from '../ui/useUiReducedMotion';
import { notificationMessage } from './notificationCopy';

const REQUEST_STICKER = require('../../assets/images/screens/friends/request_sticker.png');

const BADGE = 56;
/** The art fills this much of the badge. The coin is a full disc, so it sits a little smaller to carry the same weight. */
const BADGE_ART_SIZE = 40;
const BADGE_ART_SIZE_BY_KIND: Partial<Record<NotificationKind, number>> = { park_coins: 34 };

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
  const [faceFailed, setFaceFailed] = useState(false);
  const [heartBack, setHeartBack] = useState<'idle' | 'sent'>('idle');
  // The Yes moment starts in the same render as the green card: the store's
  // one-time token is taken during render (kept in a ref), never in an effect.
  const burstFor = useRef<string | null>(null);
  const [burstDone, setBurstDone] = useState<string | null>(null);
  const endBurst = useCallback(() => setBurstDone(burstFor.current), []);
  const surface = useContext(SurfaceContext);
  // A No: the buttons stay as they were while the screen's LeavingRow fades the row out.
  const leaving = kind === 'friend_request' && answer === 'none';
  const overrides = new Map(answer && actor ? [[actor, answer]] : []);
  const answerable = leaving || canAnswerInline(notification, overrides);
  const answeredYes = kind === 'friend_request' && answer === 'friends';
  // A request answered Yes turns into a "new friend" row right where it is.
  const shownKind: NotificationKind = answeredYes ? 'friend_accepted' : kind;
  const look = KIND_LOOK[shownKind];
  const stored = notificationMessage(notification.content?.message);
  const message = kidMessage(notification, stored, answer);
  const excerpt = notification.content?.excerpt;
  const hasRoute = !!notification.content?.route?.screen;
  const { lead, rest } = leadName(message, shownKind);
  const coins = shownKind === 'compliment' ? rewardCoins(stored) : 0;
  const artSize = BADGE_ART_SIZE_BY_KIND[shownKind] ?? BADGE_ART_SIZE;
  // The row only offers Yes/No while the request waits, so the answer starts from 'incoming'.
  if (answeredYes && actor !== null && burstFor.current !== notification.id && takeJustFriended(actor, surface)) {
    burstFor.current = notification.id;
  }
  const burst = burstFor.current === notification.id && burstDone !== notification.id;
  const hop = useHop(burst);
  const actorFace = !faceFailed ? (notification.actor_avatar_url ?? null) : null;
  const canHeartBack = kind === 'compliment' && actor !== null && (answer ?? notification.friend_status) === 'friends';
  const target = actor ? { id: actor, screen_name: nameFrom(stored), friend_status: 'incoming' as const } : null;

  return (
    <Animated.View style={styles.wrap}>
      <View style={[kit.card, styles.card, unread ? styles.cardUnread : styles.cardRead, answeredYes && styles.cardYes]}>
        {/* Behind the face disc, inside the card: the burst never covers the new friend or the words. */}
        {burst && <Burst big={1.6} away style={{ left: 47, top: 44 }} onDone={endBurst} />}
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
            {actorFace ? (
              <Animated.View style={[styles.faceWrap, hop]}>
                <View style={[styles.badge, { backgroundColor: BRAND.sky }]}>
                  <Image source={{ uri: actorFace }} placeholder={DEFAULT_PORTRAIT} placeholderContentFit="contain" style={styles.faceArt}
                    contentFit="cover" contentPosition="top" recyclingKey={`${notification.id}-face`} transition={120} onError={() => setFaceFailed(true)} />
                </View>
                {kind === 'friend_request' && !answeredYes
                  // A plain envelope that reads at sticker size.
                  ? <Image source={REQUEST_STICKER} style={styles.stickerArt} contentFit="contain" accessibilityIgnoresInvertColors />
                  : <View style={[styles.sticker, { backgroundColor: look.tint }]}><Image source={BADGE_ART[shownKind]} style={styles.stickerGlyph} contentFit="contain" /></View>}
              </Animated.View>
            ) : (
              <Animated.View style={[styles.badge, { backgroundColor: look.tint }, hop]}>
                <Image source={BADGE_ART[shownKind]} style={{ width: artSize, height: artSize }} contentFit="contain" accessibilityIgnoresInvertColors />
              </Animated.View>
            )}
            <View style={styles.body}>
              <Text style={[styles.message, !unread && styles.messageRead]} numberOfLines={3} maxFontSizeMultiplier={1.4}>
                {!!lead && <Text style={styles.lead}>{`${lead} `}</Text>}
                <GameRichText preset="bodySmall" style={[styles.message, styles.rest, !unread && styles.messageRead]} iconSize={17}>{rest.trimStart()}</GameRichText>
              </Text>
              {!!excerpt && <Text style={styles.excerpt} numberOfLines={1} maxFontSizeMultiplier={1.3}>"{excerpt}"</Text>}
              <View style={[styles.metaRow, answerable && styles.metaRowAnswer]}>
                {unread && <View style={[styles.newDot, { backgroundColor: look.color }]} />}
                <Text style={[styles.time, unread && { color: look.lip }]} maxFontSizeMultiplier={1.2}>{shortAgo(notification.created_at)}</Text>
                {coins > 0 && (
                  // What they got, without reading: the coin and the number.
                  <View style={styles.reward} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                    <GameIcon name="coin" size={20} />
                    <Text style={styles.rewardText} maxFontSizeMultiplier={1.2}>+{coins}</Text>
                  </View>
                )}
              </View>
            </View>
            {hasRoute && !answerable && (
              <View style={[styles.chevron, !unread && styles.chevronRead]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                <GameIcon name="arrow" size={20} />
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
        {answeredYes && (
          <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(12)} style={styles.answered} accessibilityLiveRegion="polite">
            <GameIcon name="sparkle" size={24} />
            <Text style={[styles.answeredText, { color: BRAND.greenLip }]} maxFontSizeMultiplier={1.2}>New friend!</Text>
          </Animated.View>
        )}
        {canHeartBack && target && (
          <View style={styles.answer}>
            <Pill compact tone={heartBack === 'sent' || actions.hearted(actor!) ? 'grey' : 'white'} icon="heart"
              label={heartBack === 'sent' || actions.hearted(actor!) ? 'Heart sent' : 'Send one back'}
              disabled={heartBack === 'sent' || actions.hearted(actor!)}
              accessibilityLabel={`Send ${target.screen_name} a heart back`}
              onPress={async () => { setHeartBack('sent'); if (!(await actions.cheer({ ...target, friend_status: 'friends' }))) setHeartBack('idle'); }} />
          </View>
        )}
      </View>
    </Animated.View>
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
  card: { paddingRight: 4 },
  // Unread: cream with the full navy outline and lip. Read: white with a soft outline, so new rows pop.
  cardUnread: { backgroundColor: BRAND.cream },
  cardYes: { backgroundColor: '#E5F8E9', borderColor: '#237A3B' },
  cardRead: { backgroundColor: '#FFFFFF', borderColor: 'rgba(5,52,110,0.42)', borderBottomWidth: 4 },
  stripe: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 16, minHeight: 84 },
  // One even ring, no lip: the fill is a perfect circle with the art dead centre.
  badge: {
    width: BADGE, height: BADGE, borderRadius: BADGE / 2, borderWidth: 2.5, borderColor: INK,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  body: { flex: 1, marginLeft: 12, marginRight: 2 },
  message: { fontFamily: FONT.body, fontSize: 17, lineHeight: 21, color: INK },
  rest: { color: '#2A4C79' },
  messageRead: { color: '#3D5F8C' },
  lead: { fontFamily: FONT.body, fontSize: 19, color: INK },
  excerpt: { fontFamily: FONT.body, fontSize: 15, color: BRAND.navySoft, marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  newDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5, borderColor: INK },
  time: { fontFamily: FONT.body, fontSize: 15, color: '#55698A', includeFontPadding: false },
  // The kit's arrow art, smaller than the old 24 pt button so it hints instead of shouting; quieter on read rows.
  chevron: { width: 28, alignItems: 'center', justifyContent: 'center' },
  chevronRead: { opacity: 0.75 },
  metaRowAnswer: { marginBottom: 4 },
  reward: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 4, height: 28, paddingLeft: 4, paddingRight: 10,
    borderRadius: 14, backgroundColor: BRAND.goldLight, borderWidth: 2, borderColor: INK,
  },
  rewardText: { fontFamily: FONT.display, fontSize: 16, color: INK, includeFontPadding: false },
  answer: { flexDirection: 'row', gap: 10, paddingLeft: 82, paddingRight: 10, paddingBottom: 12 },
  answered: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 82, paddingBottom: 12 },
  faceWrap: { width: BADGE + 4, height: BADGE + 4 },
  faceArt: { width: BADGE - 6, height: BADGE + 2 },
  stickerArt: { position: 'absolute', right: -4, bottom: -4, width: 30, height: 30 },
  sticker: {
    position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: 14, borderWidth: 1.5, borderColor: INK,
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
  },
  stickerGlyph: { width: 20, height: 20 },
  answeredText: { fontFamily: FONT.display, fontSize: 17, color: BRAND.navySoft, textTransform: 'uppercase' },
});
