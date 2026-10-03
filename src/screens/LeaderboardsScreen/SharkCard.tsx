/**
 * The kid-safe card a public Standings row opens: the shark, the username,
 * the rank and the number. No photo, no parks, no profile (PROPOSAL kid
 * safety). Friends board rows open the full profile instead.
 */
import { Modal, Pressable, Text, View } from 'react-native';
import Animated, { FadeIn, ZoomIn } from 'react-native-reanimated';
import { BRAND, GameButton, GameIcon, RADIUS, SHADOW, textPreset } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import { ScoreIcon } from './MiniPodium';
import StandingsShark from './StandingsShark';
import { unitWord, type StandingsMetric, type StandingsRowModel } from './standingsV2Model';

export default function SharkCard({ row, metric, board, onClose }: {
  readonly row: StandingsRowModel | null;
  readonly metric: StandingsMetric;
  readonly board: 'week' | 'friends' | 'all_time';
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
            <Text numberOfLines={1} adjustsFontSizeToFit style={[textPreset('title'), { marginTop: 10, textTransform: 'uppercase' }]}>{row.name}</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
              {row.rank ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 34, borderRadius: RADIUS.pill, backgroundColor: BRAND.blueBright }}>
                  {row.rank <= 3 && <GameIcon name={`medal${row.rank}` as 'medal1'} size={22} />}
                  <Text style={{ fontFamily: 'Shark', fontSize: 18, color: BRAND.white }}>{`#${row.rank}`}</Text>
                </View>
              ) : null}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 34, borderRadius: RADIUS.pill, backgroundColor: BRAND.white, borderWidth: 2, borderColor: BRAND.gold }}>
                <ScoreIcon metric={metric} size={22} />
                <Text style={{ fontFamily: 'Shark', fontSize: 18, color: BRAND.blue }}>{row.score}</Text>
              </View>
            </View>
            <Text style={[textPreset('bodySmall'), { color: BRAND.navySoft, marginTop: 8, textAlign: 'center' }]}>
              {`${row.score} ${unitWord(metric, row.score)} ${when}`}
            </Text>
            <GameButton label="Nice!" size="compact" onPress={onClose} style={{ marginTop: 14 }} />
          </Animated.View>
        </Animated.View>
      )}
    </Modal>
  );
}
