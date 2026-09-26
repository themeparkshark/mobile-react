import { type ReactNode, useContext, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';

interface Props {
  task: TaskType | SecretTaskType;
  isSecret?: boolean;
  isArchived?: boolean;
  onChooseGoal?: () => Promise<void>;
  onShowOnMap?: () => void;
  onPlayInLine?: () => void;
  trigger?: ReactNode;
}

export default function UnfoundCoinModal({ task, isSecret = false, isArchived = false, onChooseGoal, onShowOnMap, onPlayInLine, trigger }: Props) {
  const [visible, setVisible] = useState(false);
  const [afterClose, setAfterClose] = useState<'map' | 'line' | null>(null);
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalError, setGoalError] = useState(false);
  const { playSound } = useContext(SoundEffectContext);
  const isRestingSecret = isSecret && 'is_active' in task && task.is_active === false;

  const handleOpen = () => {
    setGoalError(false);
    playSound(require('../../assets/sounds/tap.mp3'));
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setVisible(true);
  };

  const handleChooseGoal = async () => {
    if (!onChooseGoal || goalBusy) return;
    setGoalBusy(true);
    setGoalError(false);
    try {
      await onChooseGoal();
      setVisible(false);
    } catch {
      setGoalError(true);
    } finally {
      setGoalBusy(false);
    }
  };

  return (
    <>
      <Pressable onPress={handleOpen} accessibilityRole="button"
        accessibilityLabel={`${task.name} ride coin, ${isRestingSecret ? 'secret, resting this week' : isSecret ? 'secret' : isArchived ? 'archived' : 'undiscovered'}`}
        style={{ opacity: isRestingSecret ? 0.68 : 1 }}>
        {trigger ?? <View
          style={{
            width: 62,
            height: 62,
            backgroundColor: isSecret ? '#594bab' : isArchived ? '#637e99' : '#0d86cf',
            borderRadius: 31,
            borderWidth: 3,
            borderColor: isSecret
              ? '#d6bfff'
              : '#ffd34a',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#003b73', shadowOpacity: 0.35,
            shadowOffset: { width: 0, height: 3 }, shadowRadius: 3,
          }}
        >
          <Text
            style={{
              fontSize: 29,
              color: '#fff',
              fontFamily: 'Shark',
              textShadowColor: '#003b73', textShadowOffset: { width: 1, height: 2 }, textShadowRadius: 1,
            }}
          >
            ?
          </Text>
        </View>}
      </Pressable>

      <Modal
        isVisible={visible}
        onModalHide={() => {
          if (afterClose === 'map') onShowOnMap?.();
          if (afterClose === 'line') onPlayInLine?.();
          setAfterClose(null);
        }}
        onBackdropPress={() => setVisible(false)}
        onSwipeComplete={() => setVisible(false)}
        swipeDirection="down"
        animationIn="zoomIn"
        animationOut="zoomOut"
        backdropOpacity={0.85}
        hideModalContentWhileAnimating
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1,
          alignItems: 'center', justifyContent: 'center', paddingVertical: 20 }}
          showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', width: '85%', zIndex: 10 }}>
            <Ribbon text={isSecret ? 'Secret Coin' : isArchived ? 'Archived Coin' : 'Undiscovered Coin'} />

            <View
              style={{
                backgroundColor: isSecret ? '#423b9e' : '#0a77bf',
                marginTop: '-10%',
                width: '95%',
                borderRadius: 20,
                borderWidth: 2.5,
                borderColor: '#fff',
                padding: 20,
                alignItems: 'center',
              }}
            >
              {/* The original shark keeps the mystery coin reveal in the app's own world. */}
              <Image
                source={require('../../assets/images/screens/park/mystery-coin-shark-v1.png')}
                style={{ width: 124, height: 124, marginBottom: 8 }}
                contentFit="contain"
                accessibilityLabel="Shark revealing a mystery ride coin"
              />

              {/* Task name (revealed!) */}
              <Text
                style={{
                  fontFamily: 'Shark',
                  fontSize: 18,
                  color: 'white',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  marginBottom: 8,
                }}
              >
                {task.name}
              </Text>

              {/* Hint text */}
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 14,
                  color: '#e2f6ff',
                  textAlign: 'center',
                  marginBottom: 16,
                  lineHeight: 20,
                }}
              >
                {isSecret
                  ? isRestingSecret
                    ? 'This mystery is resting this week. Check back when it rotates into play.'
                    : 'This is a secret coin! Explore the park to discover how to unlock it.'
                  : isArchived
                    ? 'This coin is from a past event. It may return in the future!'
                    : 'Win this ride’s challenge to add its coin to your shelf.'}
              </Text>

              {!isSecret && !isArchived && (
                <View style={{ alignSelf: 'stretch', backgroundColor: '#edfaff',
                  borderColor: '#bceaff', borderWidth: 2,
                  borderRadius: 14, padding: 14, marginBottom: 16 }}>
                  <Text style={{ color: '#075b9b', fontFamily: 'Shark', fontSize: 16, marginBottom: 5 }}>
                    Ride Challenge
                  </Text>
                  <Text style={{ color: '#204c6e', fontSize: 13, lineHeight: 19 }}>
                    {task.ticket_cost === 0
                      ? 'Free challenge. '
                      : typeof task.ticket_cost === 'number'
                      ? `${task.ticket_cost} Park Ticket${task.ticket_cost === 1 ? '' : 's'} to start. `
                      : 'Park Tickets start standard attempts. '}
                    {task.ticket_cost !== 0 && 'Out of Tickets? A Shark Rescue Pass may be available at the ride.'}
                  </Text>
                  {'energy_reward' in task && 'ride_parts_reward' in task &&
                    typeof task.coins === 'number' && typeof task.experience === 'number' &&
                    typeof task.energy_reward === 'number' && typeof task.ride_parts_reward === 'number' && (
                      <Text style={{ color: '#327395', fontSize: 12, lineHeight: 18, marginTop: 8 }}>
                        Base win: +{task.coins} Shark Coins · +{task.experience} XP ·
                        {' '}+{task.energy_reward} Energy · +{task.ride_parts_reward} Ride Parts
                      </Text>
                    )}
                </View>
              )}

              {onPlayInLine && !isSecret && !isArchived && <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Play LinePlay for ${task.name}`}
                onPress={() => { setAfterClose('line'); setVisible(false); }}
                style={{ paddingVertical: 8, marginBottom: 6 }}>
                <Text style={{ color: '#fff', fontFamily: 'Shark', fontSize: 16,
                  textDecorationLine: 'underline' }}>Waiting here? Play in Line ›</Text>
              </Pressable>}

              {onChooseGoal && !isSecret && !isArchived && <Pressable
                accessibilityRole="button"
                disabled={goalBusy}
                onPress={() => void handleChooseGoal()}
                style={{ alignSelf: 'stretch', alignItems: 'center', borderColor: '#fec90e',
                  borderWidth: 2, borderRadius: 12, paddingVertical: 11, marginBottom: 10,
                  opacity: goalBusy ? 0.6 : 1 }}>
                <Text style={{ color: '#fec90e', fontFamily: 'Shark', fontSize: 17 }}>
                  {goalBusy ? 'Saving…' : 'Make This My Goal'}
                </Text>
              </Pressable>}
              {goalError && <Text style={{ color: '#fec90e', textAlign: 'center', marginBottom: 8 }}>
                Could not save this ride goal. Try again when connected.
              </Text>}
              {onShowOnMap && !isSecret && !isArchived && <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show ${task.name} on the park map`}
                onPress={() => { setAfterClose('map'); setVisible(false); }}
                style={{ alignSelf: 'stretch', alignItems: 'center', backgroundColor: '#ffca32',
                  borderRadius: 12, paddingVertical: 12, marginBottom: 10 }}>
                <Text style={{ color: '#073e79', fontFamily: 'Shark', fontSize: 17 }}>
                  Show on Park Map
                </Text>
              </Pressable>}
              <YellowButton
                text="Got It!"
                onPress={() => setVisible(false)}
              />
            </View>
          </View>
        </ScrollView>
      </Modal>
    </>
  );
}
