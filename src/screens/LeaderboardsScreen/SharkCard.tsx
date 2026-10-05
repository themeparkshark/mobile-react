/**
 * The kid-safe card a public Standings row opens: the shark, the username,
 * the rank and the number. Your own row adds your weekly goals (v3). No photo, no parks, no profile (PROPOSAL kid
 * safety). Friends board rows open the full profile instead.
 */
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { BRAND, GameButton, GameIcon, RADIUS, SHADOW, textPreset } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { ScoreIcon } from './MiniPodium';
import StandingsShark from './StandingsShark';
import { unitWord, type StandingsMetric, type StandingsRowModel, type WeekGoal } from './standingsV2Model';

/**
 * Your weekly goals (3, 8, 15 rides): moved here from the pinned row in v3,
 * so the board shows one number and the extras wait for a tap on your row.
 */
function WeekGoals({ goals, score }: { readonly goals: readonly WeekGoal[]; readonly score: number }) {
  const reached = goals.filter(g => g.reached).length;
  const next = goals.find(g => !g.reached);
  const allDone = reached === goals.length;
  return (
    <View accessible accessibilityLabel={allDone ? 'All weekly goals done!' : `Weekly goals: ${reached} of ${goals.length} done. Next: ${next?.at} rides for ${next?.xp} XP.`}
      style={{ marginTop: 14, alignItems: 'center' }}>
      {allDone ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 14, height: 34, borderRadius: RADIUS.pill,
          backgroundColor: BRAND.gold, borderWidth: 2, borderBottomWidth: 4, borderColor: BRAND.goldLip }}>
          <GameIcon name="sparkle" size={18} />
          <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 15, color: BRAND.navy }}>ALL GOALS DONE!</Text>
          <GameIcon name="sparkle" size={18} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {goals.map(goal => {
            const isNext = goal === next;
            return (
              <View key={goal.at} style={{ alignItems: 'center', minWidth: 64, paddingVertical: 6, paddingHorizontal: 8, borderRadius: RADIUS.md,
                backgroundColor: goal.reached ? BRAND.gold : BRAND.white, borderWidth: isNext ? 3 : 2, borderBottomWidth: 4,
                borderColor: goal.reached ? BRAND.goldLip : isNext ? BRAND.blueBright : 'rgba(5,52,110,0.18)' }}>
                {goal.reached && (
                  <View style={{ position: 'absolute', top: -8, right: -8, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: BRAND.green, borderWidth: 2, borderColor: BRAND.white }}>
                    <GameIcon name="check" size={12} />
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <GameIcon name="ride" size={18} />
                  <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 17, color: BRAND.navy }}>{goal.at}</Text>
                </View>
                {isNext ? (
                  // How close: a small bar fills toward the next goal.
                  <View style={{ width: 44, height: 6, borderRadius: 3, marginTop: 4, backgroundColor: 'rgba(5,52,110,0.12)', overflow: 'hidden' }}>
                    <View style={{ width: `${Math.round(Math.min(1, score / goal.at) * 100)}%`, height: 6, backgroundColor: BRAND.blueBright }} />
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
                    <GameIcon name="xp" size={12} />
                    <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 12, color: BRAND.navy }}>{goal.xp}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

export default function SharkCard({ row, metric, board, goals = null, onClose }: {
  readonly row: StandingsRowModel | null;
  readonly metric: StandingsMetric;
  readonly board: 'week' | 'friends' | 'all_time';
  /** Your own card on a weekly board: the goals that left the pinned row. */
  readonly goals?: readonly WeekGoal[] | null;
  readonly onClose: () => void;
}) {
  const reduced = useUiReducedMotion();
  const when = board === 'all_time' ? 'collected' : 'this week';
  return (
    <Modal visible={!!row} transparent animationType="none" onRequestClose={onClose} accessibilityViewIsModal>
      {row && (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(160)} style={{ flex: 1, backgroundColor: BRAND.scrim, alignItems: 'center', justifyContent: 'center' }}>
          <Pressable accessibilityLabel="Close" style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} onPress={onClose} />
          <Animated.View entering={reduced ? undefined : ZoomIn.springify().damping(14).stiffness(220)} style={{
            width: 280, alignItems: 'center', padding: 20, borderRadius: RADIUS.xl, backgroundColor: BRAND.cream,
            borderWidth: 4, borderBottomWidth: 8, borderColor: BRAND.white, ...SHADOW.lifted,
          }}>
            <StandingsShark avatar={row.avatar} size={120} ring={row.isMe ? BRAND.gold : BRAND.skyDeep} />
            <Text maxFontSizeMultiplier={1.2} numberOfLines={1} adjustsFontSizeToFit style={[textPreset('title'), { marginTop: 10, textTransform: 'uppercase' }]}>{row.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              {row.rank ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 34, borderRadius: RADIUS.pill, backgroundColor: BRAND.blueBright }}>
                  {row.rank <= 3 && <GameIcon name={`medal${row.rank}` as 'medal1'} size={22} />}
                  <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 18, color: BRAND.white }}>{`#${row.rank}`}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 34, borderRadius: RADIUS.pill, backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.gold }}
                accessible accessibilityLabel={`${row.score} ${unitWord(metric, row.score)} ${when}`}>
                <ScoreIcon metric={metric} size={22} />
                <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 18, color: BRAND.blue }}>{row.score}</Text>
                <Text maxFontSizeMultiplier={1.2} style={{ fontFamily: 'Shark', fontSize: 13, color: BRAND.navySoft }}>{metric === 'ride_coins' ? 'COINS' : 'THIS WEEK'}</Text>
              </View>
            </View>
            {row.isMe && board !== 'all_time' && !!goals?.length && <WeekGoals goals={goals} score={row.score} />}
            <GameButton label="Nice!" size="compact" onPress={onClose} style={{ marginTop: 14 }} />
          </Animated.View>
        </Animated.View>
      )}
    </Modal>
  );
}
