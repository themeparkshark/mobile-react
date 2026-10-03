/**
 * One player on a social list: their real dressed shark, their name, their
 * level, and ONE clear thing to do that matches where you stand with them:
 *   friend     -> a heart (Cheer: 5 coins, once a day)
 *   asked you  -> Yes! / No
 *   you asked  -> Asked (tap to take it back)
 *   stranger   -> Add
 * Tap anywhere else to open their profile. Remove and Block live on the
 * profile, never one mis-tap away on a list.
 *
 * Memoized: a row re-renders only when its own player or status changes.
 */
import { memo, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import Avatar from '../../components/Avatar';
import * as RootNavigation from '../../RootNavigation';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import type { PlayerType } from '../../models/player-type';
import GameIcon from '../../ui/GameIcon';
import { BRAND, FONT } from '../../ui/tokens';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { useFriendActions, wasCheered } from '../../hooks/useFriends';
import { friendButton, type FriendStatus } from './socialModel';
import { INK, Pill, kit, useSquash } from './SocialKit';

export const ROW_HEIGHT = 92;

function PlayerRow({ player, status, inset }: { readonly player: PlayerType; readonly status: FriendStatus; readonly inset?: boolean }) {
  const actions = useFriendActions();
  // Actions start from what this row shows (a list can know more than the payload).
  const me = { ...player, friend_status: status };
  const reduced = useUiReducedMotion();
  const squash = useSquash();
  const [cheered, setCheered] = useState(() => wasCheered(player.id));
  const look = friendButton(status);
  const level = player.experience_level?.level;

  // A just-made friendship gets a little pop.
  const pop = useSharedValue(0);
  const previous = useRef(status);
  useEffect(() => {
    if (previous.current !== 'friends' && status === 'friends' && !reduced) {
      pop.value = withSequence(withTiming(1, { duration: 120 }), withSpring(0, { damping: 9, stiffness: 180 }));
    }
    previous.current = status;
  }, [status, reduced, pop]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.06 * pop.value }] }));

  useEffect(() => { setCheered(wasCheered(player.id)); }, [player.id]);

  const open = () => {
    playSfx('tap');
    haptic('tapLight');
    RootNavigation.navigate('Player', { player: player.id });
  };

  const levelText = level ? `Level ${level}` : null;
  const spoken = [player.screen_name, levelText, look.a11y(player.screen_name)].filter(Boolean).join('. ');

  return (
    <Animated.View style={[styles.wrap, inset && styles.wrapInset, popStyle]}>
      <View style={[kit.card, styles.card, status === 'incoming' && styles.cardAsk]}>
        <Pressable
          onPress={open}
          onPressIn={squash.onPressIn}
          onPressOut={squash.onPressOut}
          style={styles.main}
          accessibilityRole="button"
          accessibilityLabel={spoken}
          accessibilityHint="Opens their profile"
        >
          <Animated.View style={[styles.main, squash.style]}>
            <View style={styles.avatarRing}>
              <Avatar player={player} size="md" />
            </View>
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={1.2}>{player.screen_name}</Text>
              {status === 'incoming' ? (
                <Text style={[styles.sub, styles.subAsk]} numberOfLines={1} maxFontSizeMultiplier={1.25}>Wants to be friends!</Text>
              ) : levelText ? (
                <View style={styles.levelChip}><GameIcon name="xp" size={18} /><Text style={styles.sub} maxFontSizeMultiplier={1.25}>{levelText}</Text></View>
              ) : null}
            </View>
          </Animated.View>
        </Pressable>
        <Animated.View key={`${status}-${cheered}`} entering={reduced ? undefined : ZoomIn.springify().damping(13)} style={styles.actions}>
          {status === 'friends' && (
            <Pill
              compact
              tone={cheered ? 'grey' : 'white'}
              icon="heart"
              label={cheered ? 'Sent' : 'Send'}
              accessibilityLabel={cheered ? `Heart sent to ${player.screen_name} today` : `Send ${player.screen_name} a heart and 5 coins`}
              disabled={cheered}
              onPress={async () => { setCheered(true); if (!(await actions.cheer(me))) setCheered(false); }}
            />
          )}
          {status === 'incoming' && (
            <>
              <Pill compact iconOnly tone="grey" icon="close" label="No" accessibilityLabel={`Say no to ${player.screen_name}`} onPress={() => actions.decline(me)} />
              <Pill compact tone="green" icon="check" label="Yes!" accessibilityLabel={`Say yes to ${player.screen_name}`} onPress={() => actions.accept(me)} />
            </>
          )}
          {status === 'outgoing' && (
            <Pill compact tone="grey" icon="timer" label="Asked" accessibilityLabel={look.a11y(player.screen_name)} onPress={() => actions.cancel(me)} />
          )}
          {status === 'none' && (
            <Pill compact tone="gold" icon="shark" label="Add" accessibilityLabel={look.a11y(player.screen_name)} onPress={() => actions.add(me)} />
          )}
          {status === 'blocked' && (
            <Pill compact tone="grey" icon="lock" label="Blocked" accessibilityLabel={look.a11y(player.screen_name)} onPress={open} />
          )}
        </Animated.View>
      </View>
    </Animated.View>
  );
}

export default memo(PlayerRow, (a, b) => a.player === b.player && a.status === b.status && a.inset === b.inset);

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingBottom: 10 },
  wrapInset: { paddingHorizontal: 0 },
  card: { flexDirection: 'row', alignItems: 'center', minHeight: ROW_HEIGHT - 10, paddingRight: 10 },
  cardAsk: { backgroundColor: '#F3EDFF' },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 10, minHeight: 72 },
  avatarRing: { borderRadius: 999, borderWidth: 3, borderColor: INK, backgroundColor: BRAND.sky, padding: 1 },
  text: { flex: 1, marginLeft: 12, marginRight: 6, justifyContent: 'center' },
  name: { fontFamily: FONT.display, fontSize: 19, color: INK, textTransform: 'uppercase', includeFontPadding: false },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  sub: { fontFamily: FONT.body, fontSize: 16, color: BRAND.navySoft },
  subAsk: { color: '#5B35B8', marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
