import Lottie from 'lottie-react-native';
import { useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Pressable, View, Text, StyleSheet, TouchableOpacity, Easing, Vibration } from 'react-native';
import Modal from 'react-native-modal';
import redeemCoin from '../api/endpoints/me/coins/redeem-coin';
import redeemItem from '../api/endpoints/me/items/redeem-item';
import completeSecretTask from '../api/endpoints/me/secret-tasks/complete-secret-task';
import completeTask from '../api/endpoints/me/tasks/complete-task';
import { AuthContext } from '../context/AuthProvider';
import { CurrencyContext } from '../context/CurrencyProvider';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import { CoinType } from '../models/coin-type';
import { CurrentRedeemableType } from '../models/current-redeemable-type';
import { ItemType } from '../models/item-type';
import { ParkType } from '../models/park-type';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';
import Box from './RedeemModal/Box';
import Ribbon from './Ribbon';
import WatchAd from './WatchAd';
import YellowButton from './YellowButton';
import MiniGameSelector from './MiniGameSelector';
import PostWinRewardsModal from './PostWinRewardsModal';
import SpinWheel from './SpinWheel';
import spendTickets from '../api/endpoints/me/spend-tickets';
import failTask from '../api/endpoints/tasks/fail-task';
import failSecretTask from '../api/endpoints/secret-tasks/fail-secret-task';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const WHEEL_SIZE = Math.min(SCREEN_WIDTH * 0.7, 260);

// Ticket cost by ride importance tier
function getTicketCost(redeemable: CurrentRedeemableType): number {
  const model = redeemable.model as TaskType | SecretTaskType;
  if ('ticket_cost' in model && typeof (model as any).ticket_cost === 'number') {
    return (model as any).ticket_cost;
  }
  const xp = model.experience ?? 0;
  if (xp >= 100) return 3;
  if (xp >= 50) return 2;
  return 1;
}

function getRidePartsReward(ticketCost: number): number {
  if (ticketCost >= 3) return 3 + Math.floor(Math.random() * 3);
  if (ticketCost >= 2) return 2 + Math.floor(Math.random() * 2);
  return 1 + Math.floor(Math.random() * 2);
}

function getEnergyReward(ticketCost: number): number {
  if (ticketCost >= 3) return 30 + Math.floor(Math.random() * 21);
  if (ticketCost >= 2) return 15 + Math.floor(Math.random() * 11);
  return 5 + Math.floor(Math.random() * 11);
}

// Games for the wheel
const GAMES = [
  { id: 'tap' as const, name: 'WHACK-A-SHARK', color: '#3b82f6' },
  { id: 'timing' as const, name: 'RHYTHM TAP', color: '#8b5cf6' },
  { id: 'memory' as const, name: 'MEMORY MATCH', color: '#ec4899' },
  { id: 'trivia' as const, name: 'QUICK TRIVIA', color: '#f59e0b' },
];
const NUM_SEGMENTS = GAMES.length;
const SEGMENT_ANGLE = 360 / NUM_SEGMENTS;

type FlowState = 'preview' | 'wheel' | 'spinning' | 'landed' | 'minigame' | 'postwin' | 'lost';
type GameType = 'tap' | 'timing' | 'memory' | 'trivia';

export default function RedeemRedeemableModal({
  open,
  close,
  park,
  redeemable,
  onPress,
  onTaskFailed,
}: {
  readonly close: () => void;
  readonly open?: boolean;
  readonly park: ParkType;
  readonly redeemable: CurrentRedeemableType;
  readonly onPress: () => void;
  readonly onTaskFailed?: (taskId: number) => void;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const { player, refreshPlayer } = useContext(AuthContext);
  const progress = useRef(new Animated.Value(0)).current;
  const [doubleXP, setDoubleXP] = useState<boolean>((player && player.is_subscribed) ?? false);
  const [doubleCoins, setDoubleCoins] = useState<boolean>((player && player.is_subscribed) ?? false);
  const { currencies } = useContext(CurrencyContext);

  // Flow state
  const [flowState, setFlowState] = useState<FlowState>('preview');
  const [selectedGame, setSelectedGame] = useState<GameType | null>(null);
  const [selectedGameData, setSelectedGameData] = useState<typeof GAMES[0] | null>(null);
  const [ridePartsEarned, setRidePartsEarned] = useState(0);
  const [energyEarned, setEnergyEarned] = useState(0);

  // Wheel animation handled by SpinWheel component

  const isTaskType = redeemable?.type === 'task' || redeemable?.type === 'secret_task';
  const ticketCost = isTaskType ? getTicketCost(redeemable) : 0;
  const playerTickets = player?.tickets ?? 0;
  const hasEnoughTickets = playerTickets >= ticketCost;
  const taskName = redeemable ? (redeemable.model as TaskType | SecretTaskType).name : '';

  const backgrounds = {
    task: '#0788e4',
    coin: '#ffaa4a',
    item: '#b680e9',
    pin: '#b680e9',
    secret_task: '#023493',
  };

  // Reset state when modal opens/closes
  useEffect(() => {
    if (open) {
      setFlowState('preview');
      setSelectedGame(null);
      setSelectedGameData(null);
      setRidePartsEarned(0);
      setEnergyEarned(0);
      // Wheel animation reset handled by SpinWheel
    }
  }, [open]);

  useEffect(() => {
    if (open && flowState === 'preview') {
      playSound(require('../../assets/sounds/redeem_modal_open.mp3'));
      Animated.loop(
        Animated.timing(progress, { toValue: 1, duration: 2250, useNativeDriver: true })
      ).start();
    }
  }, [open, flowState]);

  // Start wheel - SPEND TICKETS FIRST
  const handleStartWheel = useCallback(async () => {
    console.log('🎡 handleStartWheel called');
    if (!hasEnoughTickets) {
      console.log('🎫 Not enough tickets!', { playerTickets, ticketCost });
      return;
    }
    
    // Spend tickets BEFORE showing the wheel
    try {
      const taskId = (redeemable.model as TaskType).id;
      console.log('🎫 Spending', ticketCost, 'tickets for task', taskId);
      const result = await spendTickets(taskId, ticketCost);
      console.log('🎫 Tickets spent successfully! New balance:', result.tickets);
      
      // Refresh player to update ticket count in UI
      refreshPlayer?.();
      
      playSound(require('../../assets/sounds/redeem_modal_open.mp3'));
      setFlowState('wheel');
    } catch (error: any) {
      console.error('🎫 Failed to spend tickets:', error?.message || error);
      console.error('🎫 Error response:', error?.response?.data);
      console.error('🎫 Error status:', error?.response?.status);
      
      // Show user feedback about the error
      if (error?.response?.status === 422) {
        console.log('🎫 Server says not enough tickets');
        // Don't proceed - user doesn't have enough tickets according to server
        return;
      }
      
      // For other errors (network, etc), proceed with fallback
      console.log('🎫 FALLBACK: Proceeding without ticket deduction (API error)');
      playSound(require('../../assets/sounds/redeem_modal_open.mp3'));
      setFlowState('wheel');
    }
  }, [hasEnoughTickets, ticketCost, redeemable, refreshPlayer, playSound, playerTickets]);

  // Spin the wheel - calculate result immediately, let SpinWheel animate
  const handleSpin = useCallback(() => {
    console.log('🎡 handleSpin called');
    Vibration.vibrate(50);
    
    // Pick the game FIRST so SpinWheel knows where to land
    const randomSegment = Math.floor(Math.random() * NUM_SEGMENTS);
    const game = GAMES[randomSegment];
    
    console.log('🎡 Will land on:', game.name, game.id);
    setSelectedGame(game.id);
    setSelectedGameData(game);
    setFlowState('spinning');
    
    // Wait for spin animation to complete (4 seconds) then show result
    setTimeout(() => {
      console.log('🎡 Wheel landed on:', game.name);
      setFlowState('landed');
      Vibration.vibrate([0, 80, 40, 80]);
      
      // Then transition to minigame
      setTimeout(() => {
        console.log('🎡 Transitioning to minigame');
        setFlowState('minigame');
      }, 1500);
    }, 4000);
  }, []);

  // Handle mini-game WIN - complete task and get rewards
  // Tickets were already spent when they started the wheel
  const handleGameWin = useCallback(async (multiplier: number) => {
    console.log('🏆 Mini-game WON! Completing task...');

    try {
      // Complete the task - backend returns actual rewards
      if (redeemable.type === 'task') {
        const response = await completeTask(redeemable.model as TaskType, doubleXP, doubleCoins);
        // Use ACTUAL rewards from backend
        setRidePartsEarned(response.rewards.ride_parts_earned);
        setEnergyEarned(response.rewards.energy_earned);
        console.log('🏆 Task completed! Rewards:', response.rewards);
      } else if (redeemable.type === 'secret_task') {
        const response = await completeSecretTask(redeemable.model as SecretTaskType, doubleXP, doubleCoins);
        // Use ACTUAL rewards from backend (secret tasks too!)
        setRidePartsEarned(response.rewards.ride_parts_earned);
        setEnergyEarned(response.rewards.energy_earned);
        console.log('🏆 Secret task completed! Rewards:', response.rewards);
      }
      console.log('🏆 Task completed successfully!');
      refreshPlayer?.();
      setFlowState('postwin');
    } catch (e) {
      console.error('🏆 Task completion error:', e);
      // Fallback to local calculation if API fails
      const parts = getRidePartsReward(ticketCost);
      const energy = getEnergyReward(ticketCost);
      setRidePartsEarned(Math.round(parts * multiplier));
      setEnergyEarned(Math.round(energy * multiplier));
      setFlowState('postwin');
    }
  }, [redeemable, ticketCost, doubleXP, doubleCoins, refreshPlayer]);

  // Handle mini-game LOSS - tickets already spent, task removed, no rewards
  const handleGameLose = useCallback(async () => {
    console.log('❌ Mini-game LOST! Tickets were already spent.');
    
    // Remove the task from available tasks (like missing a Pokemon)
    if (redeemable?.type === 'task') {
      const task = redeemable.model as TaskType;
      await failTask(task);
      // Also remove from local state immediately (don't wait for backend)
      onTaskFailed?.(task.id);
    } else if (redeemable?.type === 'secret_task') {
      const secretTask = redeemable.model as SecretTaskType;
      await failSecretTask(secretTask);
      // Also remove from local state immediately
      onTaskFailed?.(secretTask.id);
    }
    
    setFlowState('lost');
  }, [redeemable, onTaskFailed]);

  const handleLostClose = useCallback(() => {
    console.log('❌ Closing loss modal');
    refreshPlayer?.(); // Refresh to show updated ticket count
    onPress(); // Refresh explore screen
    close();
  }, [refreshPlayer, onPress, close]);

  const handlePostWinClose = useCallback(() => {
    onPress();
    close();
  }, [onPress, close]);

  if (!redeemable) return null;

  // Determine what to show in the modal - keep it open during minigame too!
  const showModal = open && flowState !== 'postwin';

  return (
    <>
      <Modal
        animationIn="zoomIn"
        animationOut="zoomOut"
        swipeDirection={flowState === 'preview' ? 'down' : undefined}
        isVisible={showModal}
        onSwipeComplete={() => flowState === 'preview' && close()}
        backdropOpacity={flowState === 'preview' ? 0.5 : 0.95}
      >
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          
          {/* PREVIEW STATE */}
          {flowState === 'preview' && (
            <>
              <Pressable
                style={{ width: '100%', height: '100%', position: 'absolute' }}
                onPress={() => {
                  playSound(require('../../assets/sounds/redeem_modal_close.mp3'));
                  close();
                }}
              >
                <Lottie
                  source={require('../../assets/animations/confetti.json')}
                  progress={progress}
                  style={{ position: 'absolute', width: 900, height: 400, top: 15, zIndex: 20, left: -80 }}
                />
              </Pressable>
              <View style={{ width: Dimensions.get('window').width - 40, position: 'relative', zIndex: 10, alignItems: 'center' }}>
                <Ribbon text="Congratulations" />
                <View style={{
                  backgroundColor: backgrounds[redeemable.type as keyof typeof backgrounds],
                  borderRadius: 16, marginTop: '-10%', width: '85%', zIndex: 10,
                  paddingTop: 16, paddingLeft: 16, paddingRight: 16, paddingBottom: 8,
                  shadowColor: '#000', shadowOffset: { width: 2, height: 2 }, shadowRadius: 0, shadowOpacity: 0.4,
                  borderColor: 'rgba(0, 0, 0, .4)', borderWidth: 2,
                }}>
                  <View style={{
                    paddingTop: 16, paddingBottom: 16, paddingLeft: 16, paddingRight: 16,
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderColor: 'rgba(0, 0, 0, .6)', borderLeftWidth: 2, borderRightWidth: 2, borderBottomWidth: 2,
                    borderBottomLeftRadius: 16, borderBottomRightRadius: 16,
                  }}>
                    <Box
                      background={require('../../assets/images/screens/explore/starburst.png')}
                      image={{
                        task: { uri: (redeemable.model as TaskType).coin_url },
                        secret_task: { uri: (redeemable.model as SecretTaskType).coin_url },
                        item: { uri: (redeemable.model as ItemType).icon_url },
                        pin: { uri: (redeemable.model as ItemType).icon_url },
                        coin: { uri: currencies[0].icon_url },
                      }[redeemable.type]}
                      text={{
                        task: (redeemable.model as TaskType).name,
                        secret_task: (redeemable.model as SecretTaskType).name,
                        coin: `${(redeemable.model as CoinType).coins} Coins`,
                        item: (redeemable.model as ItemType).name,
                        pin: (redeemable.model as ItemType).name,
                      }[redeemable.type]}
                      type={redeemable.type}
                      pulse
                    />
                    <View style={{ marginLeft: -4, marginRight: -4, marginTop: 8, flexDirection: 'row', justifyContent: 'center' }}>
                      <View style={{ width: '33.3333%', paddingLeft: 4, paddingRight: 4 }}>
                        <Box
                          backgroundColor="#4cdcff"
                          image={require('../../assets/images/screens/explore/xp.png')}
                          text={doubleXP ? (redeemable.model as TaskType).experience * 2 : (redeemable.model as TaskType).experience}
                          small
                          type={redeemable.type}
                        />
                        {!doubleXP && <View style={{ marginTop: 8 }}><WatchAd onClose={() => setDoubleXP(true)} /></View>}
                      </View>
                      {redeemable.type !== 'coin' && (
                        <View style={{ width: '33.3333%', paddingLeft: 4, paddingRight: 4 }}>
                          <Box
                            backgroundColor="#4cdcff"
                            image={{ uri: currencies[0].icon_url }}
                            text={doubleCoins ? (redeemable.model as TaskType).coins * 2 : (redeemable.model as TaskType).coins}
                            small
                            type={redeemable.type}
                          />
                          {!doubleCoins && <View style={{ marginTop: 8 }}><WatchAd onClose={() => setDoubleCoins(true)} /></View>}
                        </View>
                      )}
                      <View style={{ width: '33.3333%', paddingLeft: 4, paddingRight: 4 }}>
                        <Box backgroundColor="#4cdcff" image={{ uri: park.coin_url }} text={1} small type={redeemable.type} />
                      </View>
                    </View>
                  </View>
                  <View style={{ marginTop: 8 }}>
                    {isTaskType ? (
                      <>
                        <YellowButton
                          text={hasEnoughTickets ? `Spend ${ticketCost} Ticket${ticketCost > 1 ? 's' : ''} to Play!` : `Need ${ticketCost - playerTickets} more Tickets`}
                          disabled={!hasEnoughTickets}
                          onPress={handleStartWheel}
                        />
                        {!hasEnoughTickets && <Text style={styles.ticketHint}>Collect prep items at home for a chance to earn tickets!</Text>}
                        <Text style={styles.ticketCount}>Your tickets: {playerTickets}</Text>
                      </>
                    ) : (
                      <YellowButton
                        text="Collect"
                        onPress={async () => {
                          if (redeemable.type === 'coin') await redeemCoin(redeemable.model as CoinType, doubleXP);
                          else if (redeemable.type === 'item' || redeemable.type === 'pin') await redeemItem(redeemable.model as ItemType, doubleXP, doubleCoins);
                          onPress();
                          playSound(require('../../assets/sounds/redeem_modal_close.mp3'));
                          close();
                        }}
                      />
                    )}
                  </View>
                </View>
              </View>
            </>
          )}

          {/* WHEEL STATE */}
          {(flowState === 'wheel' || flowState === 'spinning' || flowState === 'landed') && (
            <View style={styles.wheelContainer}>
              <Text style={styles.wheelTitle}>🎰 SPIN TO PLAY!</Text>
              <Text style={styles.wheelSubtitle}>Cost: {ticketCost} 🎫</Text>

              <SpinWheel
                spinning={flowState === 'spinning' || flowState === 'landed'}
                landed={flowState === 'landed'}
                selectedIndex={selectedGame ? GAMES.findIndex(g => g.id === selectedGame) : null}
              />

              {flowState === 'wheel' && (
                <TouchableOpacity style={styles.spinBtn} onPress={handleSpin}>
                  <Text style={styles.spinBtnText}>🎲 TAP TO SPIN!</Text>
                </TouchableOpacity>
              )}
              {flowState === 'spinning' && <Text style={styles.spinningText}>✨ SPINNING... ✨</Text>}
              {flowState === 'landed' && selectedGameData && (
                <View style={styles.landedWrap}>
                  <Text style={styles.landedText}>🎯 {selectedGameData.name}</Text>
                  <Text style={styles.landedSub}>Get ready...</Text>
                </View>
              )}
              {/* No cancel - ticket already spent, must play! */}
            </View>
          )}

          {/* LOST STATE */}
          {flowState === 'lost' && (
            <View style={styles.lostCard}>
              <Text style={styles.lostIcon}>X</Text>
              <Text style={styles.lostTitle}>CHALLENGE FAILED</Text>
              <Text style={styles.lostMsg}>Sorry, you didn't complete the challenge.{'\n'}You lost {ticketCost} ticket{ticketCost > 1 ? 's' : ''}.</Text>
              <TouchableOpacity style={styles.lostBtn} onPress={handleLostClose}>
                <Text style={styles.lostBtnText}>Next</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* MINIGAME STATE - rendered inside the same modal */}
          {console.log('🎮 MiniGame render check:', { 
            selectedGame, 
            flowState, 
            open,
            shouldShow: flowState === 'minigame',
            showModal,
          })}
          {selectedGame && flowState === 'minigame' && (
            <View style={styles.minigameContainer}>
              <MiniGameSelector
                visible={true}
                taskId={(redeemable?.model as TaskType)?.id ?? 0}
                taskName={taskName}
                preferredGame={selectedGame}
                onClose={handleGameLose}
                onComplete={(mult) => handleGameWin(mult)}
              />
            </View>
          )}
        </View>
      </Modal>

      {/* Post-Win Rewards */}
      <PostWinRewardsModal
        visible={open === true && flowState === 'postwin'}
        rideName={taskName}
        ridePartsEarned={ridePartsEarned}
        energyEarned={energyEarned}
        onClose={handlePostWinClose}
      />
    </>
  );
}

const styles = StyleSheet.create({
  ticketHint: { color: 'rgba(255,255,255,0.6)', fontSize: 11, textAlign: 'center', marginTop: 6, fontStyle: 'italic' },
  ticketCount: { color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center', marginTop: 6, fontWeight: '600' },
  minigameContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  
  // Wheel styles
  wheelContainer: { alignItems: 'center', padding: 16 },
  wheelTitle: { color: '#fff', fontSize: 28, fontWeight: '900', marginBottom: 4, textShadowColor: 'rgba(251,191,36,0.5)', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10 },
  wheelSubtitle: { color: '#fbbf24', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  spinBtn: { 
    backgroundColor: '#22c55e', 
    paddingHorizontal: 48, 
    paddingVertical: 18, 
    borderRadius: 16, 
    marginTop: 16,
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
  },
  spinBtnText: { color: '#fff', fontSize: 22, fontWeight: '900' },
  spinningText: { color: '#fbbf24', fontSize: 22, fontWeight: '900', marginTop: 16 },
  landedWrap: { alignItems: 'center', marginTop: 16 },
  landedText: { color: '#4ade80', fontSize: 26, fontWeight: '900' },
  landedSub: { color: 'rgba(255,255,255,0.6)', fontSize: 16, marginTop: 4 },
  cancelBtn: { marginTop: 12, padding: 10 },
  cancelText: { color: 'rgba(255,255,255,0.5)', fontSize: 15 },

  // Lost styles
  lostCard: { backgroundColor: '#1a1a2e', borderRadius: 20, padding: 32, alignItems: 'center', borderWidth: 3, borderColor: '#ef4444', width: '85%' },
  lostIcon: { fontSize: 64, fontWeight: '900', color: '#ef4444', marginBottom: 16 },
  lostTitle: { fontSize: 24, fontWeight: '900', color: '#ef4444', marginBottom: 16 },
  lostMsg: { fontSize: 16, color: '#fff', textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  lostBtn: { backgroundColor: '#ef4444', paddingHorizontal: 48, paddingVertical: 14, borderRadius: 12 },
  lostBtnText: { color: '#fff', fontSize: 18, fontWeight: '800' },
});
