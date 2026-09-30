import { type ReactNode, useContext, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
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
import MysteryCoinArtwork from './MysteryCoinArtwork';
import CoinSocket from './collection/CoinSocket';
import GameIcon from '../ui/GameIcon';
import useReducedGameMotion from '../hooks/useReducedGameMotion';

interface Props {
  task: TaskType | SecretTaskType;
  isSecret?: boolean;
  isArchived?: boolean;
  onChooseGoal?: () => Promise<void>;
  onShowOnMap?: () => void;
  onPlayInLine?: () => void;
  trigger?: ReactNode;
  size?: number;
  /** A reviewed ride (Ride Passport) or another park coin; unknown reads as a coin. */
  kind?: 'ride' | 'coin';
  /** Highlight the empty socket as the player's goal. */
  isGoal?: boolean;
}

/** Copy for the missing coin, by what kind of place earns it. */
export function unfoundCoinCopy({ isSecret, isArchived, isResting, kind }: {
  isSecret: boolean; isArchived: boolean; isResting: boolean; kind?: 'ride' | 'coin';
}): { ribbon: string; hint: string; challenge: string } {
  if (isSecret) return {
    ribbon: 'Secret Coin',
    hint: isResting
      ? 'This mystery is resting this week. Check back when it rotates into play.'
      : 'A secret coin. Explore the park to find where it hides.',
    challenge: 'Secret Challenge',
  };
  if (isArchived) return {
    ribbon: 'Archived Coin',
    hint: 'This coin is from a past event. It may come back in a future event.',
    challenge: 'Event Challenge',
  };
  return kind === 'ride'
    ? { ribbon: 'Ride Coin', hint: 'Win this ride’s challenge at the ride to add its coin to your shelf.', challenge: 'Ride Challenge' }
    : { ribbon: 'Park Coin', hint: 'Win this spot’s challenge in the park to add its coin to your shelf.', challenge: 'Coin Challenge' };
}

export default function UnfoundCoinModal({ task, isSecret = false, isArchived = false, onChooseGoal, onShowOnMap, onPlayInLine, trigger, size = 62, kind, isGoal = false }: Props) {
  const [visible, setVisible] = useState(false);
  const [afterClose, setAfterClose] = useState<'map' | 'line' | null>(null);
  const [goalBusy, setGoalBusy] = useState(false);
  const [goalError, setGoalError] = useState(false);
  const { playSound } = useContext(SoundEffectContext);
  const reducedMotion = useReducedGameMotion();
  const isRestingSecret = isSecret && 'is_active' in task && task.is_active === false;
  const copy = unfoundCoinCopy({ isSecret, isArchived, isResting: isRestingSecret, kind });
  const playable = !isSecret && !isArchived;

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
        {trigger ?? (isSecret || !task.coin_url
          ? <MysteryCoinArtwork size={size} variant={isSecret ? 'secret' : isArchived ? 'archived' : 'normal'} />
          : <CoinSocket size={size} coinUrl={task.coin_url} goal={isGoal} />)}
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
        animationIn={reducedMotion ? 'fadeIn' : 'zoomIn'}
        animationOut={reducedMotion ? 'fadeOut' : 'zoomOut'}
        animationInTiming={reducedMotion ? 120 : 220}
        animationOutTiming={reducedMotion ? 120 : 180}
        backdropOpacity={0.85}
        hideModalContentWhileAnimating
      >
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1,
          alignItems: 'center', justifyContent: 'center', paddingVertical: 20 }}
          showsVerticalScrollIndicator={false}>
          <View style={{ alignItems: 'center', width: '85%', zIndex: 10 }}>
            <Ribbon text={copy.ribbon} />

            <View
              style={{
                backgroundColor: isSecret ? '#05509a' : '#0a77bf',
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
                {copy.hint}
              </Text>

              {!isSecret && !isArchived && (
                <View style={{ alignSelf: 'stretch', backgroundColor: '#edfaff',
                  borderColor: '#bceaff', borderWidth: 2,
                  borderRadius: 14, padding: 14, marginBottom: 16 }}>
                  <Text style={{ color: '#075b9b', fontFamily: 'Shark', fontSize: 16, marginBottom: 5 }}>
                    {copy.challenge}
                  </Text>
                  <Text style={{ color: '#204c6e', fontFamily: 'Knockout', fontSize: 14, lineHeight: 19 }}>
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
                      <Text style={{ color: '#327395', fontFamily: 'Knockout', fontSize: 13, lineHeight: 18, marginTop: 8 }}>
                        Base win: +{task.coins} Shark Coins · +{task.experience} XP ·
                        {' '}+{task.energy_reward} Energy · +{task.ride_parts_reward} Ride Parts
                      </Text>
                    )}
                </View>
              )}

              {/* One primary gameplay action: play here in line, else go find it on the map. */}
              {playable && (onPlayInLine || onShowOnMap) && <YellowButton
                text={onPlayInLine ? 'Play in Line' : 'Show on Park Map'}
                onPress={() => { setAfterClose(onPlayInLine ? 'line' : 'map'); setVisible(false); }} />}
              {playable && onPlayInLine && onShowOnMap && <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Show ${task.name} on the park map`}
                onPress={() => { setAfterClose('map'); setVisible(false); }}
                style={styles.secondary}>
                <GameIcon name="map" size={22} />
                <Text style={styles.secondaryText}>Show on Park Map</Text>
              </Pressable>}
              {playable && onChooseGoal && <Pressable
                accessibilityRole="button"
                disabled={goalBusy}
                onPress={() => void handleChooseGoal()}
                style={[styles.secondary, { opacity: goalBusy ? 0.6 : 1 }]}>
                <GameIcon name="star" size={22} />
                <Text style={styles.secondaryText}>{goalBusy ? 'Saving…' : 'Make This My Goal'}</Text>
              </Pressable>}
              {goalError && <Text style={styles.error}>
                Could not save this goal. Try again when connected.
              </Text>}
              {playable && (onPlayInLine || onShowOnMap)
                ? <Pressable accessibilityRole="button" onPress={() => setVisible(false)} style={styles.quiet}>
                    <Text style={styles.quietText}>Not now</Text>
                  </Pressable>
                : <YellowButton text="Got It!" onPress={() => setVisible(false)} />}
            </View>
          </View>
        </ScrollView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  secondary: { alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#e4f7ff', borderWidth: 2, borderColor: '#ffffff', borderBottomWidth: 4, borderBottomColor: '#9ccbe9',
    borderRadius: 14, paddingVertical: 11, marginTop: 10 },
  secondaryText: { color: '#05346e', fontFamily: 'Shark', fontSize: 17 },
  error: { color: '#ffe07a', fontFamily: 'Knockout', fontSize: 15, textAlign: 'center', marginTop: 8 },
  quiet: { minHeight: 44, justifyContent: 'center', alignItems: 'center', marginTop: 6 },
  quietText: { color: '#e4f7ff', fontFamily: 'Shark', fontSize: 16 },
});
