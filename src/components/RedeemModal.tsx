import { useContext, useEffect, useRef, useState } from 'react';
import { Animated, Text, View, type TextStyle, type ViewStyle } from 'react-native';
import useReducedGameMotion from '../hooks/useReducedGameMotion';
import { opportunityIsActive } from '../screens/ExploreScreen/mapOpportunityTiming';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import { CoinType } from '../models/coin-type';
import { CurrentRedeemableType } from '../models/current-redeemable-type';
import { KeyType } from '../models/key-type';
import { ParkType } from '../models/park-type';
import { RedeemableType } from '../models/redeemable-type';
import RedeemCurrentRedeemableModal from './RedeemCurrentRedeemableModel';
import RedeemKeyModal from './RedeemKeyModal';
import RedeemRedeemableModal from './RedeemRedeemableModal';
import RedeemVaultModal from './RedeemVaultModal';
import YellowButton from './YellowButton';
import { TaskType } from '../models/task-type';
import { BRAND, GameIcon } from '../ui';

export default function RedeemModal({
  redeemable,
  park,
  onPress,
  onTaskFailed,
  onTaskCompleted,
  selectedTaskId = null,
  onOpenChange,
}: {
  /** The ride selected on the map; PLAY RIDE hides while a different ride is selected. */
  readonly selectedTaskId?: number | null;
  /** The challenge flow opened or closed (for the map's one-overlay-at-a-time queue). */
  readonly onOpenChange?: (open: boolean) => void;
  readonly redeemable?: CurrentRedeemableType;
  readonly park: ParkType;
  readonly onPress: () => void;
  readonly onTaskFailed?: (taskId: number) => void;
  readonly onTaskCompleted?: (taskId: number, isSecretTask: boolean) => void;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  // Nearby opportunities can refresh or disappear as soon as a win is confirmed.
  // The opened challenge owns its snapshot until the player closes its reward flow.
  const [openedRedeemable, setOpenedRedeemable] = useState<CurrentRedeemableType | null>(null);
  const reducedMotion = useReducedGameMotion();
  const lastAnnounced = useRef<string | null>(null);
  const animated = useRef(new Animated.Value(0)).current;

  const openChange = useRef(onOpenChange); openChange.current = onOpenChange;
  useEffect(() => { openChange.current?.(modalVisible); }, [modalVisible]);
  useEffect(() => () => openChange.current?.(false), []);
  const task = redeemable?.type === 'task' ? redeemable.model as TaskType : null;
  // Selecting a different ride on the map means the player is looking elsewhere.
  const otherSelected = !!task && selectedTaskId !== null && selectedTaskId !== task.id;
  const timed = redeemable?.type === 'coin' || redeemable?.type === 'key' || redeemable?.type === 'redeemable';
  const available = !!redeemable && !otherSelected && (!timed || opportunityIsActive(
    redeemable.model as CoinType | KeyType | RedeemableType));
  const identity = redeemable ? `${redeemable.type}:${redeemable.model.id}` : null;
  useEffect(() => {
    if (available && identity !== lastAnnounced.current) {
      lastAnnounced.current = identity;
      void playSound(require('../../assets/sounds/in_redeem_zone.mp3'));
    } else if (!available) {
      lastAnnounced.current = null;
    }
    animated.stopAnimation();
    if (reducedMotion) animated.setValue(available ? -120 : 0);
    else Animated.timing(animated, { toValue: available ? -120 : 0,
      duration: 240, useNativeDriver: true }).start();
    return () => animated.stopAnimation();
  }, [available, identity, reducedMotion, animated, playSound]);

  return (
    <>
      {redeemable && available && (
        <Animated.View
          style={{
            transform: [
              {
                translateY: animated,
              },
            ],
          }}
        >
          <YellowButton
            onPress={async () => {
              setOpenedRedeemable(redeemable);
              setModalVisible(true);
            }}
            text={redeemable.type === 'task' ? 'Play Ride!'
              : redeemable.type === 'secret_task' ? 'Play Secret!' : 'Redeem'}
          />
          {task && <View pointerEvents="none" style={styles.caption} accessible
            accessibilityLabel={`${task.name}. Costs ${task.ticket_cost ?? 1} ${(task.ticket_cost ?? 1) === 1 ? 'Ticket' : 'Tickets'}.`}>
            <Text style={styles.captionText} numberOfLines={1}>{task.name}</Text>
            <View style={styles.cost}>
              <GameIcon name="ticket" size={16} />
              <Text style={styles.captionText}>{task.ticket_cost ?? 1}</Text>
            </View>
          </View>}
        </Animated.View>
      )}
      {openedRedeemable && (
        <>
          {openedRedeemable?.type === 'redeemable' && (
            <RedeemCurrentRedeemableModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={openedRedeemable.model as RedeemableType}
              onPress={() => onPress()}
            />
          )}
          {openedRedeemable?.type === 'key' && (
            <RedeemKeyModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={openedRedeemable}
              onPress={() => onPress()}
            />
          )}
          {openedRedeemable?.type === 'vault' && (
            <RedeemVaultModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={openedRedeemable}
              onPress={() => onPress()}
            />
          )}
          {(openedRedeemable?.type === 'coin' ||
            openedRedeemable?.type === 'task' ||
            openedRedeemable?.type === 'item' ||
            openedRedeemable?.type === 'pin' ||
            openedRedeemable?.type === 'secret_task') && (
            <RedeemRedeemableModal
              open={modalVisible}
              redeemable={openedRedeemable}
              close={() => setModalVisible(false)}
              park={park}
              onPress={() => onPress()}
              onTaskFailed={onTaskFailed}
              onTaskCompleted={onTaskCompleted}
            />
          )}
        </>
      )}
    </>
  );
}

const styles: Record<'caption' | 'cost', ViewStyle> & { captionText: TextStyle } = {
  // Ride name and price under PLAY RIDE, on a white tab with his navy outline.
  caption: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: -4, maxWidth: '100%',
    backgroundColor: BRAND.white, borderRadius: 12, borderWidth: 2, borderColor: BRAND.navy, paddingHorizontal: 10, paddingVertical: 3 },
  captionText: { fontFamily: 'Shark', fontSize: 13, color: BRAND.navy, flexShrink: 1 },
  cost: { flexDirection: 'row', alignItems: 'center', gap: 2 },
};
