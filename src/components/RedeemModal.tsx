import dayjs from 'dayjs';
import { useContext, useEffect, useRef, useState } from 'react';
import { Animated } from 'react-native';
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
  const animated = useRef(new Animated.Value(0)).current;

  const slideUp = () => {
    Animated.timing(animated, {
      toValue: -120,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  const slideDown = () => {
    Animated.timing(animated, {
      toValue: 0,
      duration: 500,
      useNativeDriver: true,
    }).start();
  };

  useEffect(() => {
    const isActive =
      (redeemable?.type === 'coin' &&
        dayjs().isBetween(
          dayjs((redeemable?.model as CoinType).active_from),
          dayjs((redeemable?.model as CoinType).active_to)
        )) ||
      (redeemable?.type === 'key' &&
        dayjs().isBetween(
          dayjs((redeemable?.model as KeyType).active_from),
          dayjs((redeemable?.model as KeyType).active_to)
        )) ||
      (redeemable?.type === 'redeemable' &&
        dayjs().isBetween(
          dayjs((redeemable?.model as RedeemableType).active_from),
          dayjs((redeemable?.model as RedeemableType).active_to)
        )) ||
      !!redeemable?.type;

    if (redeemable && isActive) {
      playSound(require('../../assets/sounds/in_redeem_zone.mp3'));
      slideUp();
    } else {
      slideDown();
    }
  }, [redeemable?.model.id]);

  return (
    <>
      {redeemable && (
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
              setModalVisible(true);
            }}
            text={'Redeem'}
          />
        </Animated.View>
      )}
      {redeemable && (
        <>
          {redeemable?.type === 'redeemable' && (
            <RedeemCurrentRedeemableModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={redeemable.model as RedeemableType}
              onPress={() => onPress()}
            />
          )}
          {redeemable?.type === 'key' && (
            <RedeemKeyModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={redeemable}
              onPress={() => onPress()}
            />
          )}
          {redeemable?.type === 'vault' && (
            <RedeemVaultModal
              open={modalVisible}
              close={() => setModalVisible(false)}
              redeemable={redeemable}
              onPress={() => onPress()}
            />
          )}
          {(redeemable?.type === 'coin' ||
            redeemable?.type === 'task' ||
            redeemable?.type === 'item' ||
            redeemable?.type === 'pin' ||
            redeemable?.type === 'secret_task') && (
            <RedeemRedeemableModal
              open={modalVisible}
              redeemable={redeemable}
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
