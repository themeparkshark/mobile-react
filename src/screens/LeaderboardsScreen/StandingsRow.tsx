/**
 * Standings list pieces (WS8): the ranked row under the podium, the list card
 * it sits in, and the "be the first on the podium" invitation.
 */
import { useContext } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeInRight } from 'react-native-reanimated';
import * as RootNavigation from '../../RootNavigation';
import Avatar from '../../components/Avatar';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import { PlayerType } from '../../models/player-type';
import { BRAND, GameButton, GameIcon, RADIUS, SHADOW, textPreset, type GameIconName } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import MemberFlex from '../../components/money/MemberFlex';
import { memberFlexOf } from '../../services/money/memberFlex';

const tapSound = require('../../../assets/sounds/tap.mp3');

/** Rows cascade in after the podium lands; the delay stops growing after a screenful. */
export function rowEnterDelay(index: number, base = 650): number {
  return base + Math.min(index, 10) * 55;
}

export function StandingsRow({ player, rank, score, scoreIcon, detail, isMe, index, highlight, enterDelayBase, interactive = true, label }: {
  readonly player: PlayerType;
  readonly rank: number;
  readonly score: number;
  readonly scoreIcon: GameIconName;
  readonly detail?: string;
  readonly isMe?: boolean;
  readonly index: number;
  /** Top-three styling for lists without a podium (Rides tab). */
  readonly highlight?: boolean;
  /** When the cascade starts; lists under a podium wait for it to land. */
  readonly enterDelayBase?: number;
  /** False on Near Me boards, which never open a profile. */
  readonly interactive?: boolean;
  /** Spoken label; defaults to rank, name and score. */
  readonly label?: string;
}) {
  const reduced = useUiReducedMotion();
  const { playSound } = useContext(SoundEffectContext);
  // Season frame, ring and VIP mark, only when the payload carries them (else the row is unchanged).
  const flex = memberFlexOf(player);
  const medal: GameIconName | null = highlight && rank <= 3 ? (`medal${rank}` as GameIconName) : null;
  return (
    <Animated.View entering={reduced ? undefined : FadeInRight.delay(rowEnterDelay(index, enterDelayBase)).springify().damping(15).stiffness(170)}>
      <Pressable
        accessibilityRole={interactive ? 'button' : 'text'}
        accessibilityLabel={label ?? `Rank ${rank}, ${player.screen_name}, ${score}`}
        disabled={!interactive}
        onPress={() => { playSound(tapSound); RootNavigation.navigate('Player', { player: player.id }); }}
        style={({ pressed }) => ({
          flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 12, marginHorizontal: 12, marginVertical: 4,
          borderRadius: RADIUS.md, borderWidth: isMe ? 3 : 2,
          borderColor: isMe ? BRAND.gold : highlight && rank <= 3 ? BRAND.goldLight : 'rgba(7,104,185,0.16)',
          backgroundColor: isMe ? '#fff4cc' : highlight && rank <= 3 ? BRAND.cream : BRAND.white,
          transform: [{ scale: pressed ? 0.98 : 1 }],
        })}
      >
        {medal ? <GameIcon name={medal} size={34} style={{ marginRight: 8 }} /> : (
          <View style={{
            width: 34, height: 34, borderRadius: 17, marginRight: 8, alignItems: 'center', justifyContent: 'center',
            backgroundColor: BRAND.blueBright, borderBottomWidth: 3, borderBottomColor: BRAND.blueLip,
          }}>
            <Text style={{ fontFamily: 'Shark', fontSize: rank > 99 ? 12 : 16, color: BRAND.white }}>{rank > 0 ? rank : '-'}</Text>
          </View>
        )}
        {flex ? <MemberFlex inventory={player.inventory} frame={flex.frame} vip={flex.vip} step={flex.step} size={50} still /> : (
        <View style={{ width: 50, height: 50, borderRadius: 25, overflow: 'hidden', backgroundColor: BRAND.sky }}>
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' }}>
            <GameIcon name="shark" size={40} />
          </View>
          <Avatar player={player} size="sm" />
        </View>)}
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text numberOfLines={1} style={{ fontFamily: 'Shark', fontSize: 18, color: BRAND.navy, textTransform: 'uppercase' }}>
            {player.screen_name}
          </Text>
          {(isMe || detail) && (
            <Text numberOfLines={1} style={[textPreset('caption'), { color: isMe ? BRAND.goldLip : BRAND.navySoft }]}>
              {isMe ? 'YOU' : detail}
            </Text>
          )}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <GameIcon name={scoreIcon} size={22} />
          <Text style={{ fontFamily: 'Shark', fontSize: 22, color: BRAND.blue, fontVariant: ['tabular-nums'] }}>
            {(Number(score) || 0).toLocaleString()}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** The cream card the list sits on, tucked under the barrels. */
export function StandingsListCard({ children }: { readonly children: React.ReactNode }) {
  return (
    <View style={{
      marginTop: -14, borderTopLeftRadius: RADIUS.lg, borderTopRightRadius: RADIUS.lg, backgroundColor: BRAND.cream,
      paddingTop: 12, paddingBottom: 40, minHeight: 160, borderTopWidth: 3, borderColor: BRAND.white, ...SHADOW.card,
    }}>
      {children}
    </View>
  );
}

/** "Be the first on the podium": the empty board turns into the next thing to do. */
export function StandingsInvite({ title, message, actionLabel, onAction, icon = 'trophy' }: {
  readonly title: string;
  readonly message: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
  readonly icon?: GameIconName;
}) {
  const reduced = useUiReducedMotion();
  return (
    <Animated.View entering={reduced ? undefined : FadeInDown.delay(700).springify().damping(14)}
      style={{ alignItems: 'center', paddingHorizontal: 24, paddingTop: 8, paddingBottom: 8 }}>
      <GameIcon name={icon} size={56} />
      <Text style={[textPreset('title'), { textAlign: 'center', textTransform: 'uppercase', marginTop: 6 }]}>{title}</Text>
      <Text style={[textPreset('body'), { textAlign: 'center', color: BRAND.navySoft, marginTop: 4, marginBottom: 14 }]}>{message}</Text>
      {actionLabel && onAction && <GameButton label={actionLabel} icon="ride" onPress={onAction} size="compact" />}
    </Animated.View>
  );
}

/** A short line under a podium that has open spots but nobody below it. */
export function StandingsNudge({ text }: { readonly text: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 24, paddingVertical: 12 }}>
      <GameIcon name="sparkle" size={22} />
      <Text style={[textPreset('bodySmall'), { color: BRAND.navySoft, textAlign: 'center', flexShrink: 1 }]}>{text}</Text>
    </View>
  );
}
