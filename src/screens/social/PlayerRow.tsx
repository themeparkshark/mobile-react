/**
 * One player on a social list: their own shark, their name, their level, and
 * ONE clear thing to do that matches where you stand with them:
 *   friend     -> Heart (5 coins, once a day; the heart flies to their shark)
 *   asked you  -> No / Yes!  (Yes bursts and the row turns green: Friends!)
 *   you asked  -> Asked (tap to take it back)
 *   stranger   -> Add
 * Tap anywhere else to open their profile. Remove and Block live on the
 * profile, never one mis-tap away on a list.
 *
 * Recycle-safe: nothing animates because a cell was reused. Moments play once,
 * from the social store, on the row that shows that player. After any change
 * the buttons ignore taps for 600 ms, so a double tap can't land on the next
 * state (Add then "Take back?").
 */
import { memo, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import * as RootNavigation from '../../RootNavigation';
import { haptic } from '../../gamekit/Haptics';
import { playSfx } from '../../gamekit/SFX';
import type { PlayerType } from '../../models/player-type';
import GameIcon from '../../ui/GameIcon';
import { BRAND, FONT } from '../../ui/tokens';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { useFriendActions } from '../../hooks/useFriends';
import { friendButton, type FriendStatus } from './socialModel';
import { INK, Pill, kit, useSquash } from './SocialKit';
import { Burst, FlyHeart, SharkFace } from './SocialFx';
import { SurfaceContext, takeJustFriended } from './socialStore';

export const ROW_HEIGHT = 92;
const ADD_ART = require('../../../assets/images/screens/friends/add_friend.png');
const LOCK_MS = 600;

function PlayerRow({ player, status, inset }: { readonly player: PlayerType; readonly status: FriendStatus; readonly inset?: boolean }) {
  const actions = useFriendActions();
  // Actions start from what this row shows (a list can know more than the payload).
  const me = { ...player, friend_status: status };
  const reduced = useUiReducedMotion();
  const squash = useSquash();
  const [hearted, setHearted] = useState(() => actions.hearted(player.id));
  const [burst, setBurst] = useState(false);
  const [fresh, setFresh] = useState(false);
  const [cardW, setCardW] = useState(360);
  const [flying, setFlying] = useState(false);
  const look = friendButton(status);
  const level = player.experience_level?.level;

  // Recycled into a different player: reset local moments, never replay them.
  const shownId = useRef(player.id);
  const lockedUntil = useRef(0);
  const shownStatus = useRef(status);
  if (shownId.current !== player.id) {
    shownId.current = player.id;
    shownStatus.current = status;
    lockedUntil.current = 0;
  }
  if (shownStatus.current !== status) {
    shownStatus.current = status;
    lockedUntil.current = Date.now() + LOCK_MS;
  }
  // Only a different player resets the row (actions change identity whenever the signed-in player refreshes).
  const heartedNow = actions.hearted;
  useEffect(() => { setHearted(heartedNow(player.id)); setBurst(false); setFresh(false); setFlying(false); }, [player.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const surface = useContext(SurfaceContext);
  const pop = useSharedValue(0);
  useEffect(() => {
    if (status === 'friends' && takeJustFriended(player.id, surface)) {
      setBurst(true);
      setFresh(true);
      const t = setTimeout(() => setFresh(false), 1800);
      if (!reduced) pop.value = withSequence(withTiming(1, { duration: 120 }), withSpring(0, { damping: 7, stiffness: 200 }));
      return () => clearTimeout(t);
    }
    return undefined;
  }, [status, player.id, reduced, pop, surface]);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.07 * pop.value }] }));

  const guard = (fn: () => unknown) => () => { if (Date.now() >= lockedUntil.current) fn(); };
  const endBurst = useCallback(() => setBurst(false), []);
  const endFly = useCallback(() => setFlying(false), []);

  const open = () => {
    playSfx('tap');
    haptic('tapLight');
    RootNavigation.navigate('Player', { player: player.id });
  };

  const levelText = level ? `Level ${level}` : null;
  const spoken = [player.screen_name, levelText, look.a11y(player.screen_name)].filter(Boolean).join('. ');
  const justMade = fresh && status === 'friends';

  return (
    <Animated.View style={[styles.wrap, inset && styles.wrapInset, popStyle]}>
      <View onLayout={e => setCardW(e.nativeEvent.layout.width)} style={[kit.card, styles.card, status === 'incoming' && styles.cardAsk, status === 'incoming' && styles.cardStack, justMade && styles.cardNew]}>
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
            <SharkFace player={player} />
            <View style={styles.text}>
              <Text style={styles.name} numberOfLines={1} maxFontSizeMultiplier={1.2}>{player.screen_name}</Text>
              {status === 'incoming' ? (
                <Text style={[styles.sub, styles.subAsk]} numberOfLines={1} maxFontSizeMultiplier={1.25}>Wants to be friends!</Text>
              ) : justMade ? (
                <Animated.Text entering={reduced ? undefined : FadeIn} style={[styles.sub, styles.subNew]} numberOfLines={1} maxFontSizeMultiplier={1.25}>
                  New friend!
                </Animated.Text>
              ) : levelText ? (
                <View style={styles.levelChip}><GameIcon name="xp" size={18} /><Text style={styles.sub} maxFontSizeMultiplier={1.25}>{levelText}</Text></View>
              ) : null}
            </View>
          </Animated.View>
        </Pressable>
        <View style={[styles.actions, status === 'incoming' && styles.actionsBelow]}>
          {status === 'friends' && (
            <Pill
              compact
              tone={hearted ? 'grey' : 'white'}
              icon="heart"
              label={hearted ? 'Sent' : 'Heart'}
              accessibilityLabel={hearted ? `Heart sent to ${player.screen_name} today` : `Send ${player.screen_name} a heart and 5 coins`}
              disabled={hearted}
              onPress={guard(async () => {
                setHearted(true);
                setFlying(true);
                if (!(await actions.cheer(me))) setHearted(false);
              })}
            />
          )}
          {status === 'incoming' && (
            <>
              <Pill compact tone="grey" icon="close" label="No" style={{ flex: 1 }} accessibilityLabel={`Say no to ${player.screen_name}`} onPress={guard(() => actions.decline(me))} />
              <Pill compact tone="green" icon="check" label="Yes!" style={{ flex: 2 }} accessibilityLabel={`Say yes to ${player.screen_name}`} onPress={guard(() => actions.accept(me))} />
            </>
          )}
          {status === 'outgoing' && (
            <Pill compact tone="grey" icon="timer" label="Asked" accessibilityLabel={look.a11y(player.screen_name)} onPress={guard(() => actions.cancel(me))} />
          )}
          {status === 'none' && (
            <Pill compact tone="gold" image={ADD_ART} label="Add" accessibilityLabel={look.a11y(player.screen_name)} onPress={guard(() => actions.add(me))} />
          )}
          {status === 'blocked' && (
            <Pill compact tone="grey" icon="close" label="Blocked" accessibilityLabel={look.a11y(player.screen_name)} onPress={open} />
          )}
        </View>
        {flying && <View style={styles.flyFrom}><FlyHeart dx={-(cardW - 62 - 46)} dy={0} onDone={endFly} /></View>}
        {burst && status === 'friends' && <Burst style={styles.burstAt} onDone={endBurst} />}
      </View>
    </Animated.View>
  );
}

export default memo(PlayerRow, (a, b) => a.player === b.player && a.status === b.status && a.inset === b.inset);

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 14, paddingBottom: 10 },
  wrapInset: { paddingHorizontal: 0 },
  card: { flexDirection: 'row', alignItems: 'center', minHeight: ROW_HEIGHT - 10, paddingRight: 10, overflow: 'visible' },
  cardAsk: { backgroundColor: '#F3EDFF' },
  cardStack: { flexDirection: 'column', alignItems: 'stretch', paddingRight: 0 },
  cardNew: { backgroundColor: '#E5F8E9', borderColor: BRAND.greenLip },
  main: { flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 10, minHeight: 72 },
  text: { flex: 1, marginLeft: 12, marginRight: 6, justifyContent: 'center' },
  name: { fontFamily: FONT.display, fontSize: 19, color: INK, textTransform: 'uppercase', includeFontPadding: false },
  levelChip: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  sub: { fontFamily: FONT.body, fontSize: 16, color: BRAND.navySoft },
  subAsk: { color: '#5B35B8', marginTop: 2 },
  subNew: { color: BRAND.greenLip, fontFamily: FONT.display, textTransform: 'uppercase' },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionsBelow: { paddingLeft: 82, paddingRight: 12, paddingBottom: 12, marginTop: -4 },
  flyFrom: { position: 'absolute', right: 62, top: 30 },
  burstAt: { left: 44, top: 44 },
});
