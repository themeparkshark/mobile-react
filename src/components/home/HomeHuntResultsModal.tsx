/**
 * Monday results (spec 5.5): podium reveal, 900 ms rank countdown, ribbon
 * label, chest, rewards fly to the counters, one Claim button. Team result,
 * stamps and the Perfect Week count are rows inside this modal. A held result
 * shows the neutral checking copy and no Claim button. Reduce Motion shows the
 * finished card at once.
 */
import { Image } from 'expo-image';
import { useContext, useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeInDown, SlideInUp, ZoomIn } from 'react-native-reanimated';
import { claimHomeHuntResult, type HomeHuntResult } from '../../api/endpoints/me/homeHunt';
import { HOME_HUNT_COPY } from '../../constants/homeHuntCopy';
import { AuthContext } from '../../context/AuthProvider';
import { useCurrencyFly } from '../../context/CurrencyFlyProvider';
import { queueHaptic } from '../../gamekit/Haptics';
import { showToast } from '../../utils/toast';
import { BRAND, GameButton, GameIcon, ICON_SOURCES, RADIUS, SHADOW } from '../../ui';
import useUiReducedMotion from '../../ui/useUiReducedMotion';
import Ribbon from '../Ribbon';
import {
  HELD_COPY, RANK_COUNTDOWN_MS, canClaim, extraRows, isHeld, rankCountdownValue, rankLabel, revealTimeline, ribbonLabel, rewardRows,
} from './homeHuntResultsModel';

const CHEST_CLOSED = require('../../../assets/images/daily/chest-closed.png');
const CHEST_OPEN = require('../../../assets/images/daily/chest-open.png');

type Phase = 0 | 1 | 2 | 3 | 4 | 5;

export default function HomeHuntResultsModal({ result, visible, onClose, onClaimed }: {
  readonly result: HomeHuntResult | null;
  readonly visible: boolean;
  readonly onClose: () => void;
  readonly onClaimed: (result: HomeHuntResult) => void;
}) {
  const reduced = useUiReducedMotion();
  const { width, height } = useWindowDimensions();
  const { triggerFly } = useCurrencyFly();
  const { refreshPlayer } = useContext(AuthContext);
  const [phase, setPhase] = useState<Phase>(reduced ? 5 : 0);
  const [shownRank, setShownRank] = useState<number | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const claimLock = useRef(false);
  const weekKey = result?.week_key ?? null;
  const held = isHeld(result);
  const rank = result?.rank != null && Number.isFinite(result.rank) ? result.rank : null;

  // Phase 1 countdown, 2 ribbon, 3 chest opens, 4 rewards, 5 claim.
  useEffect(() => {
    if (!visible || !result) return;
    setError(null);
    if (reduced) { setPhase(5); setShownRank(rank); return; }
    const line = revealTimeline(false);
    setPhase(0);
    setShownRank(rank == null ? null : rankCountdownValue(rank, 0));
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, next: Phase) => timers.push(setTimeout(() => setPhase(next), ms));
    at(line.countdown, 1); at(line.ribbon, 2); at(line.chest, 3); at(line.rewards, 4); at(line.claim, 5);
    timers.push(setTimeout(() => queueHaptic('tapLight'), line.chest));
    let frame = 0;
    const start = Date.now() + line.countdown;
    const tick = () => {
      if (rank != null) setShownRank(rankCountdownValue(rank, Date.now() - start));
      if (Date.now() - start < RANK_COUNTDOWN_MS) frame = requestAnimationFrame(tick);
    };
    timers.push(setTimeout(() => { frame = requestAnimationFrame(tick); }, line.countdown));
    return () => { timers.forEach(clearTimeout); cancelAnimationFrame(frame); };
  }, [visible, weekKey, reduced]);

  if (!result) return null;
  const rewards = rewardRows(result);
  const extras = extraRows(result);
  const medal = rank != null && rank <= 3 ? (`medal${rank}` as 'medal1' | 'medal2' | 'medal3') : 'trophy';
  const enter = <T,>(animation: T) => (reduced ? undefined : animation);

  const claim = async () => {
    if (claimLock.current || !canClaim(result)) return;
    claimLock.current = true;
    setClaiming(true);
    setError(null);
    try {
      const claimed = await claimHomeHuntResult(result.week_key);
      queueHaptic('success');
      const note = claimed.ticket_note ?? claimed.result?.ticket_note;
      if (note) showToast(note, 'info', 5000);
      onClaimed(claimed.result ?? { ...result, status: 'claimed' });
      (['energy', 'tickets'] as const).forEach(kind => {
        const amount = result.rewards?.[kind] ?? 0;
        if (amount > 0) {
          triggerFly({ imageSource: ICON_SOURCES[kind === 'energy' ? 'energy' : 'ticket'], amount: Math.min(8, amount),
            startX: width / 2, startY: height * 0.55, targetPosition: kind });
        }
      });
      void refreshPlayer().catch(() => undefined);
    } catch {
      setError('Could not claim that. Try again.');
    } finally {
      claimLock.current = false;
      setClaiming(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: BRAND.scrim, alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <View style={{
          width: '100%', maxWidth: 380, maxHeight: '92%', borderRadius: RADIUS.xl, backgroundColor: BRAND.cream,
          borderWidth: 3, borderColor: BRAND.white, ...SHADOW.lifted, overflow: 'hidden',
        }}>
          <ScrollView contentContainerStyle={{ padding: 16, alignItems: 'center' }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontFamily: 'Knockout', fontSize: 15, color: BRAND.navySoft, letterSpacing: 0.6 }}>
              {(result.week_label ?? 'THIS WEEK').toUpperCase()}
            </Text>

            {/* Podium reveal: the shark rises onto the medal, then the rank counts down onto its place. */}
            <Animated.View entering={enter(ZoomIn.springify().damping(12))} style={{ alignItems: 'center', marginTop: 6 }}>
              <GameIcon name={medal} size={64} />
              <GameIcon name="shark" size={72} style={{ marginTop: -8 }} />
            </Animated.View>
            {rank != null && (
              <Text accessibilityLabel={`Rank ${rank}`} style={{ fontFamily: 'Shark', fontSize: 44, color: BRAND.navy, fontVariant: ['tabular-nums'] }}>
                #{phase >= 1 || reduced ? (shownRank ?? rank) : rankCountdownValue(rank, 0)}
              </Text>
            )}
            {!!rankLabel(result) && rank == null && (
              <Text style={{ fontFamily: 'Shark', fontSize: 20, color: BRAND.navy }}>{rankLabel(result)}</Text>
            )}
            {rank != null && !!result.board_label && (
              <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft }}>{`in the ${result.board_label}`}</Text>
            )}
            <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: BRAND.navy, marginTop: 2 }}>
              {(result.points ?? 0).toLocaleString()} points, {result.finds ?? 0} {(result.finds ?? 0) === 1 ? 'find' : 'finds'}
            </Text>

            {phase >= 2 && (
              <Animated.View entering={enter(SlideInUp.springify().damping(13))} style={{ width: '100%', marginTop: 8 }}>
                <Ribbon text={ribbonLabel(result)} />
              </Animated.View>
            )}

            {held ? (
              <Animated.View entering={enter(FadeIn)} style={{ marginTop: 8, alignItems: 'center' }}>
                <GameIcon name="timer" size={44} />
                <Text style={{ fontFamily: 'Knockout', fontSize: 18, lineHeight: 23, color: BRAND.navy, textAlign: 'center', marginTop: 6 }}>{HELD_COPY}</Text>
              </Animated.View>
            ) : (
              <>
                {phase >= 2 && (
                  <Image source={phase >= 3 ? CHEST_OPEN : CHEST_CLOSED} contentFit="contain"
                    style={{ width: 140, height: 120, marginTop: 4 }} accessibilityLabel="Reward chest" />
                )}
                {phase >= 4 && rewards.map((row, index) => (
                  <Animated.View key={row.key} entering={enter(FadeInDown.delay(index * 120).springify())}
                    style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingVertical: 4 }}>
                    <GameIcon name={row.icon} size={30} />
                    <Text style={{ flex: 1, marginLeft: 8, fontFamily: 'Knockout', fontSize: 18, color: BRAND.navy }}>{row.label}</Text>
                    <Text style={{ fontFamily: 'Shark', fontSize: 24, color: BRAND.blue, fontVariant: ['tabular-nums'] }}>{row.value}</Text>
                  </Animated.View>
                ))}
              </>
            )}

            {phase >= 4 && extras.map(row => (
              <Animated.View key={row.key} entering={enter(FadeIn)}
                style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', paddingVertical: 4 }}>
                <GameIcon name={row.icon} size={26} />
                <Text style={{ marginLeft: 8, fontFamily: 'Knockout', fontSize: 16, color: BRAND.navySoft }}>{row.label}</Text>
                <Text numberOfLines={2} style={{ flex: 1, textAlign: 'right', fontFamily: 'Shark', fontSize: 16, color: BRAND.navy }}>{row.value}</Text>
              </Animated.View>
            ))}

            {!!error && <Text style={{ fontFamily: 'Knockout', fontSize: 15, color: BRAND.redLip, marginTop: 6 }}>{error}</Text>}

            {phase >= 5 && (
              <Animated.View entering={enter(FadeIn)} style={{ alignSelf: 'stretch', marginTop: 12 }}>
                {held ? (
                  <GameButton label={HOME_HUNT_COPY.close} onPress={onClose} />
                ) : (
                  <GameButton label={claiming ? HOME_HUNT_COPY.claiming : HOME_HUNT_COPY.claim} loading={claiming} onPress={() => void claim()} />
                )}
              </Animated.View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
