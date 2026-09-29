import { useContext, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
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

export default function RedeemModal({
  redeemable,
  park,
  onPress,
  onTaskFailed,
  onTaskCompleted,
}: {
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

  const timed = redeemable?.type === 'coin' || redeemable?.type === 'key' || redeemable?.type === 'redeemable';
  const available = !!redeemable && (!timed || opportunityIsActive(
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
