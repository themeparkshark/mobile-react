import { useCallback, useContext, useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { Image } from 'expo-image';
import { Video, ResizeMode, Audio } from 'expo-av';
import { useNavigation, useRoute } from '@react-navigation/native';

// Sound assets
const SOUNDS = {
  reveal: require('../../assets/sounds/reveal.mp3'),
  reward: require('../../assets/sounds/reward.mp3'),
  coin: require('../../assets/sounds/coin.mp3'),
  nope: require('../../assets/sounds/nope.mp3'),
  whoosh: require('../../assets/sounds/whoosh.mp3'),
  modalOpen: require('../../assets/sounds/modal_open.mp3'),
  modalClose: require('../../assets/sounds/modal_close.mp3'),
  buttonPress: require('../../assets/sounds/button_press.mp3'),
  success: require('../../assets/sounds/purchase_item_success.mp3'),
};
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import { useCurrencyFly } from '../context/CurrencyFlyProvider';
import api from '../api/client';
import * as Haptics from '../helpers/haptics';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Video background is 964x2144, scale to fit screen width
const BG_ASPECT = 2144 / 964;
const SCALED_HEIGHT = SCREEN_WIDTH * BG_ASPECT;

// Position ratios based on 1080x2400 design
// Lockers are roughly at y=920 in the design
const LOCKER_Y_RATIO = 0.42;
const LOCKER_WIDTH_RATIO = 0.23;
const LOCKER_HEIGHT_RATIO = 0.12;

// Question mark buttons - positioned to overlay the artwork's question marks
// In the artwork they're at approximately y=710 out of 2400
const Q_BUTTON_Y_RATIO = 0.315;
const Q_BUTTON_SIZE = 60; // slightly larger tap target

// Leave Gift button position (bottom right area)
const LEAVE_GIFT_Y_RATIO = 0.74;
const LEAVE_GIFT_X_RATIO = 0.66;

interface Gift {
  id: number;
  giver_name: string;
  created_at: string;
}

interface CenterData {
  id: number;
  name: string;
  available_gifts: number;
  gifts: Gift[];
  can_give: boolean;
  can_claim: boolean;
  give_cooldown_remaining: number;
  claim_cooldown_remaining: number;
}

export default function CommunityCenterScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { parkId, centerId } = route.params as { parkId: number; centerId: number };
  
  const [loading, setLoading] = useState(true);
  const [center, setCenter] = useState<CenterData | null>(null);
  const [claiming, setClaiming] = useState<number | null>(null); // which slot is being claimed
  const [giving, setGiving] = useState(false);
  const [revealedSlots, setRevealedSlots] = useState<Set<number>>(new Set());
  const [showCooldownModal, setShowCooldownModal] = useState(false);
  const [cooldownType, setCooldownType] = useState<'claim' | 'give'>('claim');
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [showConfirmGiveModal, setShowConfirmGiveModal] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [successType, setSuccessType] = useState<'claim' | 'give'>('claim');
  const [successGiverName, setSuccessGiverName] = useState('');
  const [showNotEnoughCoinsModal, setShowNotEnoughCoinsModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [flyingTicket, setFlyingTicket] = useState<{ startX: number; startY: number; count: number } | null>(null);
  const [justGiftedSlot, setJustGiftedSlot] = useState<number | null>(null); // Which slot shows "gift placed" animation
  const [liveCooldown, setLiveCooldown] = useState(0); // Live countdown in seconds for the badge
  
  const { player, refreshPlayer } = useContext(AuthContext);
  const { triggerFly } = useCurrencyFly();
  
  // Sound player helper
  const playSound = async (soundKey: keyof typeof SOUNDS) => {
    try {
      const { sound } = await Audio.Sound.createAsync(SOUNDS[soundKey]);
      await sound.playAsync();
      // Unload after playing to free memory
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
        }
      });
    } catch (error) {
      console.log('Sound play error:', error);
    }
  };
  
  // Target position for ticket icon (top right currency display)
  // Currency display is at top: 60, right: 20, ticket icon is roughly 50px from right edge
  const ticketTargetPos = { x: SCREEN_WIDTH - 70, y: 76 };
  
  // Flying ticket animation
  const ticketFlyAnim = useRef(new Animated.Value(0)).current;
  const ticketFlyScale = useRef(new Animated.Value(1)).current;
  
  // Animations for each slot
  const slot1Anim = useRef(new Animated.Value(0)).current;
  const slot2Anim = useRef(new Animated.Value(0)).current;
  const slot3Anim = useRef(new Animated.Value(0)).current;
  const slotAnims = [slot1Anim, slot2Anim, slot3Anim];
  
  // Floating animation for bags
  const floatAnim = useRef(new Animated.Value(0)).current;
  
  // Bounce animation for question marks with gifts
  const bounceAnim1 = useRef(new Animated.Value(0)).current;
  const bounceAnim2 = useRef(new Animated.Value(0)).current;
  const bounceAnim3 = useRef(new Animated.Value(0)).current;
  const bounceAnims = [bounceAnim1, bounceAnim2, bounceAnim3];
  
  // Pulse animation for Leave Gift button
  const pulseAnim = useRef(new Animated.Value(1)).current;
  
  // Wiggle animation for question marks
  const wiggleAnim = useRef(new Animated.Value(0)).current;
  
  // Gift placed animation (glow effect on question mark)
  const giftPlacedAnim = useRef(new Animated.Value(0)).current;
  
  // Scale animation for button presses
  const leaveGiftScale = useRef(new Animated.Value(1)).current;
  const goBackScale = useRef(new Animated.Value(1)).current;
  
  // Entrance animation
  const entranceAnim = useRef(new Animated.Value(0)).current;
  
  // Countdown timer for cooldown modal
  useEffect(() => {
    if (showCooldownModal && cooldownSeconds > 0) {
      const timer = setInterval(() => {
        setCooldownSeconds(prev => {
          if (prev <= 1) {
            clearInterval(timer);
            setShowCooldownModal(false);
            fetchCenter(); // Refresh data when cooldown ends
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [showCooldownModal, cooldownSeconds > 0]);
  
  // Entrance animation on mount
  useEffect(() => {
    Animated.spring(entranceAnim, {
      toValue: 1,
      friction: 8,
      tension: 40,
      useNativeDriver: true,
    }).start();
  }, []);
  
  // Floating animation for bags
  useEffect(() => {
    const float = Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -8,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    float.start();
    return () => float.stop();
  }, []);
  
  // Bouncing question marks when gifts are available
  useEffect(() => {
    if (!center?.gifts) return;
    
    center.gifts.forEach((gift, index) => {
      if (gift && index < 3 && !revealedSlots.has(index)) {
        // Staggered bounce animation
        const delay = index * 200;
        const bounce = Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.spring(bounceAnims[index], {
              toValue: -12,
              friction: 3,
              tension: 200,
              useNativeDriver: true,
            }),
            Animated.spring(bounceAnims[index], {
              toValue: 0,
              friction: 3,
              tension: 200,
              useNativeDriver: true,
            }),
            Animated.delay(2000), // Pause between bounces
          ])
        );
        bounce.start();
      }
    });
  }, [center?.gifts, revealedSlots]);
  
  // Wiggle animation for question marks
  useEffect(() => {
    const wiggle = Animated.loop(
      Animated.sequence([
        Animated.timing(wiggleAnim, {
          toValue: 1,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(wiggleAnim, {
          toValue: -1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(wiggleAnim, {
          toValue: 0,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.delay(3000),
      ])
    );
    wiggle.start();
    return () => wiggle.stop();
  }, []);
  
  // Pulse animation for Leave Gift button when available
  useEffect(() => {
    if (center?.can_give && (player?.coins ?? 0) >= 350) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.08,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 800,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      pulseAnim.setValue(1);
    }
  }, [center?.can_give, player?.coins]);
  
  const fetchCenter = useCallback(async () => {
    console.log('🏠 Fetching community center for park:', parkId);
    try {
      const response = await api.get(`/parks/${parkId}/community-center`);
      console.log('🏠 Community center data:', JSON.stringify(response.data));
      setCenter(response.data);
    } catch (error: any) {
      console.error('🏠 Failed to fetch community center:', error?.response?.status, error?.response?.data);
    } finally {
      setLoading(false);
    }
  }, [parkId]);
  
  useEffect(() => {
    fetchCenter();
  }, [fetchCenter]);
  
  // Track previous gift count to detect new arrivals
  const prevGiftCount = useRef(0);
  
  // Auto-refresh every 15 seconds to catch new gifts from other players
  useEffect(() => {
    const refreshInterval = setInterval(async () => {
      const prevCount = center?.available_gifts ?? 0;
      await fetchCenter();
    }, 15000);
    
    return () => clearInterval(refreshInterval);
  }, [fetchCenter, center?.available_gifts]);
  
  // Notify when new gifts appear
  useEffect(() => {
    const currentCount = center?.available_gifts ?? 0;
    if (prevGiftCount.current > 0 && currentCount > prevGiftCount.current) {
      // New gift appeared!
      playSound('reveal');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
    prevGiftCount.current = currentCount;
  }, [center?.available_gifts]);
  
  // Live cooldown ticker for the badge
  useEffect(() => {
    if (center?.give_cooldown_remaining && center.give_cooldown_remaining > 0) {
      setLiveCooldown(center.give_cooldown_remaining);
    }
  }, [center?.give_cooldown_remaining]);
  
  useEffect(() => {
    if (liveCooldown <= 0) return;
    
    const timer = setInterval(() => {
      setLiveCooldown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          // Refresh center data when cooldown ends
          fetchCenter();
          playSound('reveal'); // Play a sound when cooldown ends
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [liveCooldown > 0]);
  
  // Animate button press
  const animatePress = (scaleAnim: Animated.Value) => {
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.9,
        duration: 50,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 3,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
  };
  
  // Trigger flying ticket animation
  const triggerTicketFly = (slotIndex: number | 'give', ticketCount: number, onComplete: () => void) => {
    let startX: number, startY: number;
    
    if (slotIndex === 'give') {
      // From Leave Gift button
      startX = SCREEN_WIDTH * LEAVE_GIFT_X_RATIO + 80;
      startY = SCALED_HEIGHT * LEAVE_GIFT_Y_RATIO;
    } else {
      // From gift slot
      const leftPositions = [0.11, 0.39, 0.67];
      startX = SCREEN_WIDTH * leftPositions[slotIndex] + (SCREEN_WIDTH * LOCKER_WIDTH_RATIO) / 2;
      startY = SCALED_HEIGHT * LOCKER_Y_RATIO;
    }
    
    setFlyingTicket({ startX, startY, count: ticketCount });
    ticketFlyAnim.setValue(0);
    ticketFlyScale.setValue(1.5); // Start bigger
    
    // Animate fly + scale down
    Animated.parallel([
      Animated.timing(ticketFlyAnim, {
        toValue: 1,
        duration: 600,
        easing: Easing.bezier(0.2, 0.8, 0.2, 1),
        useNativeDriver: true,
      }),
      Animated.timing(ticketFlyScale, {
        toValue: 0.5,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
    ]).start(() => {
      setFlyingTicket(null);
      // Pulse the ticket counter
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      onComplete();
    });
  };
  
  const handleRevealSlot = (slotIndex: number) => {
    console.log('🎁 Reveal slot tapped:', slotIndex, 'hasGift:', !!center?.gifts?.[slotIndex]);
    if (revealedSlots.has(slotIndex)) return;
    
    // Satisfying haptic + sound
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playSound('reveal');
    
    // Animate the reveal
    Animated.spring(slotAnims[slotIndex], {
      toValue: 1,
      friction: 6,
      tension: 100,
      useNativeDriver: true,
    }).start();
    
    setRevealedSlots(prev => new Set(Array.from(prev).concat(slotIndex)));
  };
  
  const handleClaim = async (slotIndex: number) => {
    if (!center || claiming !== null) return;
    
    const gift = center.gifts[slotIndex];
    if (!gift) return;
    
    // Check if on cooldown (backend returns seconds)
    if (!center.can_claim && center.claim_cooldown_remaining > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      playSound('nope');
      setCooldownType('claim');
      setCooldownSeconds(center.claim_cooldown_remaining); // Already in seconds
      setShowCooldownModal(true);
      return;
    }
    
    setClaiming(slotIndex);
    
    try {
      const response = await api.post(`/community-centers/${center.id}/claim`, {
        gift_id: gift.id,
      });
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      // Animate bag flying away
      Animated.timing(slotAnims[slotIndex], {
        toValue: 2,
        duration: 300,
        useNativeDriver: true,
      }).start();
      
      // Store giver name for success modal
      const giverName = response.data?.giver_name || gift.giver_name || 'A friendly shark';
      
      await refreshPlayer?.();
      await fetchCenter();
      
      // Reset animation for this slot
      setTimeout(() => {
        slotAnims[slotIndex].setValue(0);
        setRevealedSlots(prev => {
          const next = new Set(prev);
          next.delete(slotIndex);
          return next;
        });
      }, 500);
      
      // Trigger flying ticket animation, then show success modal
      playSound('coin'); // Play coin sound as ticket flies
      triggerTicketFly(slotIndex, 1, () => {
        playSound('success'); // Play success when it lands
        setSuccessType('claim');
        setSuccessGiverName(giverName);
        setShowSuccessModal(true);
        // Double haptic for celebration effect
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 100);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 200);
      });
      
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errorData = error.response?.data;
      
      // Check if it's a cooldown error from the server (backend returns seconds)
      if (errorData?.cooldown_remaining) {
        setCooldownType('claim');
        setCooldownSeconds(errorData.cooldown_remaining); // Already in seconds
        setShowCooldownModal(true);
      } else if (errorData?.error_code === 'gift_not_found' || errorData?.error_code === 'already_claimed') {
        // Gift was claimed by someone else - refresh and show message
        setErrorMessage('Oops! Another shark grabbed that gift first. 🦈');
        setShowErrorModal(true);
        await fetchCenter(); // Refresh to show updated state
        // Reset the revealed slot
        setRevealedSlots(prev => {
          const next = new Set(prev);
          next.delete(slotIndex);
          return next;
        });
        slotAnims[slotIndex].setValue(0);
      } else {
        // Generic error
        setErrorMessage(errorData?.error || 'Something went wrong. Try again!');
        setShowErrorModal(true);
      }
      console.error('Claim failed:', errorData || error);
    } finally {
      setClaiming(null);
    }
  };
  
  const handleLeaveGiftPress = async () => {
    console.log('🎁 Leave gift tapped, center:', !!center, 'giving:', giving, 'coins:', player?.coins);
    if (!center || giving) return;
    
    // Animate button press + sound
    animatePress(leaveGiftScale);
    playSound('buttonPress');
    
    const hasEnoughCoins = (player?.coins ?? 0) >= 350;
    if (!hasEnoughCoins) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      playSound('nope');
      setShowNotEnoughCoinsModal(true);
      return;
    }
    
    // Fetch fresh data to get accurate cooldown time
    try {
      const response = await api.get(`/parks/${parkId}/community-center`);
      const freshCenter = response.data;
      setCenter(freshCenter);
      
      // Check if on cooldown with fresh data (backend returns seconds)
      if (!freshCenter.can_give && freshCenter.give_cooldown_remaining > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        playSound('nope');
        setCooldownType('give');
        setCooldownSeconds(freshCenter.give_cooldown_remaining); // Already in seconds
        setShowCooldownModal(true);
        return;
      }
    } catch (error) {
      console.error('Failed to refresh center data:', error);
      // Fall back to cached data (backend returns seconds)
      if (!center.can_give && center.give_cooldown_remaining > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        setCooldownType('give');
        setCooldownSeconds(center.give_cooldown_remaining); // Already in seconds
        setShowCooldownModal(true);
        return;
      }
    }
    
    // Show confirmation modal with haptic + sound
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playSound('modalOpen');
    setShowConfirmGiveModal(true);
  };
  
  const handleConfirmGive = async () => {
    if (!center || giving) return;
    
    setShowConfirmGiveModal(false);
    setGiving(true);
    
    try {
      await api.post(`/community-centers/${center.id}/give`);
      
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      
      await refreshPlayer?.();
      await fetchCenter();
      
      // Find an empty slot to show "gift placed" animation
      const emptySlotIndex = [0, 1, 2].find(i => !center.gifts?.[i]);
      if (emptySlotIndex !== undefined) {
        setJustGiftedSlot(emptySlotIndex);
        giftPlacedAnim.setValue(0);
        Animated.sequence([
          Animated.timing(giftPlacedAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.delay(1500),
          Animated.timing(giftPlacedAnim, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start(() => setJustGiftedSlot(null));
      }
      
      // Play whoosh as gift is placed
      playSound('whoosh');
      
      // Trigger flying ticket animation, then show success modal
      playSound('coin'); // Play coin sound as tickets fly
      triggerTicketFly('give', 2, () => {
        playSound('success'); // Play success when it lands
        setSuccessType('give');
        setShowSuccessModal(true);
        // Double haptic for celebration effect
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy), 100);
        setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium), 200);
      });
      
    } catch (error: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      const errorData = error.response?.data;
      
      // Check if it's a cooldown error from the server (backend returns seconds)
      if (errorData?.cooldown_remaining) {
        setCooldownType('give');
        setCooldownSeconds(errorData.cooldown_remaining); // Already in seconds
        setShowCooldownModal(true);
      } else if (errorData?.error?.includes('full')) {
        // Center is full
        setErrorMessage('The community center is full! Come back later when someone claims a gift. 🎁');
        setShowErrorModal(true);
      } else if (errorData?.error?.includes('Not enough coins')) {
        // Not enough coins (shouldn't happen since we check first, but just in case)
        setShowNotEnoughCoinsModal(true);
      } else {
        // Generic error
        setErrorMessage(errorData?.error || 'Something went wrong. Try again!');
        setShowErrorModal(true);
      }
      console.error('Give failed:', errorData || error);
    } finally {
      setGiving(false);
    }
  };
  
  const renderSlot = (slotIndex: number) => {
    const gift = center?.gifts?.[slotIndex];
    const hasGift = !!gift;
    const isRevealed = revealedSlots.has(slotIndex);
    const anim = slotAnims[slotIndex];
    
    // Position each slot
    const leftPositions = [0.11, 0.39, 0.67]; // x positions for 3 slots
    
    const bagScale = anim.interpolate({
      inputRange: [0, 0.5, 1, 2],
      outputRange: [0, 1.2, 1, 0], // Pop in effect
    });
    
    const bagOpacity = anim.interpolate({
      inputRange: [0, 1, 2],
      outputRange: [0, 1, 0],
    });
    
    const bagRotate = anim.interpolate({
      inputRange: [0, 0.3, 0.6, 1, 2],
      outputRange: ['0deg', '-10deg', '10deg', '0deg', '180deg'], // Wiggle then spin away
    });
    
    // X positions for question marks (centered over each locker)
    const qButtonXPositions = [0.205, 0.485, 0.765];
    
    return (
      <View
        key={slotIndex}
        style={[
          styles.slotContainer,
          {
            left: SCREEN_WIDTH * leftPositions[slotIndex],
            top: SCALED_HEIGHT * LOCKER_Y_RATIO,
            width: SCREEN_WIDTH * LOCKER_WIDTH_RATIO,
            height: SCALED_HEIGHT * LOCKER_HEIGHT_RATIO,
          },
        ]}
      >
        {/* Question mark button with bounce animation */}
        {!isRevealed && (
          <Animated.View
            style={{
              position: 'absolute',
              left: SCREEN_WIDTH * (qButtonXPositions[slotIndex] - leftPositions[slotIndex]) - Q_BUTTON_SIZE / 2,
              top: SCALED_HEIGHT * (Q_BUTTON_Y_RATIO - LOCKER_Y_RATIO),
              transform: [
                { translateY: hasGift ? bounceAnims[slotIndex] : 0 },
                { rotate: hasGift ? wiggleAnim.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: ['-5deg', '0deg', '5deg'],
                }) : '0deg' },
                // Gift placed animation - scale up then down
                { scale: justGiftedSlot === slotIndex ? giftPlacedAnim.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [1, 1.3, 1.1],
                }) : 1 },
              ],
              // Glow effect when gift is placed
              opacity: justGiftedSlot === slotIndex ? giftPlacedAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0.5, 1],
              }) : 1,
            }}
          >
            <TouchableOpacity
              style={styles.questionButton}
              onPress={() => {
                if (hasGift) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  handleRevealSlot(slotIndex);
                } else if (justGiftedSlot === slotIndex) {
                  // Tapping the slot where you just placed a gift
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  playSound('buttonPress');
                } else {
                  // Shake feedback when no gift
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                  playSound('nope');
                }
              }}
              activeOpacity={0.7}
            >
              <Image
                source={require('../../assets/images/screens/community-center-question.png')}
                style={[
                  styles.questionImage,
                  !hasGift && justGiftedSlot !== slotIndex && styles.questionImageDim,
                ]}
                contentFit="contain"
              />
              {/* "Your Gift!" label when just placed */}
              {justGiftedSlot === slotIndex && (
                <Animated.View 
                  style={[
                    styles.yourGiftLabel,
                    { opacity: giftPlacedAnim }
                  ]}
                >
                  <Text style={styles.yourGiftText}>Your Gift! 🎁</Text>
                </Animated.View>
              )}
            </TouchableOpacity>
          </Animated.View>
        )}
        
        {/* Gift bag (revealed) */}
        {hasGift && isRevealed && (
          <TouchableOpacity
            onPress={() => handleClaim(slotIndex)}
            disabled={claiming !== null}
            activeOpacity={0.8}
          >
            <Animated.View
              style={[
                styles.bagContainer,
                {
                  transform: [
                    { scale: bagScale },
                    { translateY: floatAnim },
                    { rotate: bagRotate },
                  ],
                  opacity: bagOpacity,
                },
              ]}
            >
              <Image
                source={require('../../assets/images/screens/community-center-bag.png')}
                style={styles.bagImage}
                contentFit="contain"
              />
              {claiming === slotIndex && (
                <ActivityIndicator
                  style={styles.claimingSpinner}
                  color="#fff"
                  size="small"
                />
              )}
            </Animated.View>
            <Text style={styles.giverName} numberOfLines={1}>
              From: {gift.giver_name}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };
  
  const hasEnoughCoins = (player?.coins ?? 0) >= 350;
  
  return (
    <View style={styles.container}>
      <View style={[styles.background, { height: SCALED_HEIGHT }]}>
        {/* Video Background */}
        <Video
          source={require('../../assets/videos/community-center-bg.mp4')}
          style={styles.videoBackground}
          resizeMode={ResizeMode.COVER}
          shouldPlay
          isLooping
          isMuted
        />
        
        {/* Go Back button - positioned at bottom */}
        <Animated.View
          style={[
            styles.goBackContainer,
            {
              transform: [{ scale: goBackScale }],
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => {
              // Animate press
              Animated.sequence([
                Animated.timing(goBackScale, {
                  toValue: 0.9,
                  duration: 50,
                  useNativeDriver: true,
                }),
                Animated.spring(goBackScale, {
                  toValue: 1,
                  friction: 3,
                  tension: 200,
                  useNativeDriver: true,
                }),
              ]).start();
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              playSound('buttonPress');
              setTimeout(() => navigation.goBack(), 150);
            }}
            activeOpacity={0.9}
          >
            <Image
              source={require('../../assets/images/screens/community-center-go-back.png')}
              style={styles.goBackImage}
              contentFit="contain"
            />
          </TouchableOpacity>
        </Animated.View>
        
        {/* Currency display */}
        <View style={styles.currencyDisplay}>
          <Image
            source={require('../../assets/images/screens/community-center-coin.png')}
            style={styles.coinIcon}
            contentFit="contain"
          />
          <Text style={styles.coinText}>{player?.coins ?? 0}</Text>
          <View style={styles.currencyDivider} />
          <Image
            source={require('../../assets/images/ticket-icon.png')}
            style={styles.ticketIcon}
            contentFit="contain"
          />
          <Text style={styles.ticketText}>{player?.tickets ?? 0}</Text>
        </View>
        
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#4ade80" />
          </View>
        ) : (
          <>
            {/* Gift count indicator with entrance animation */}
            <Animated.View 
              style={[
                styles.giftCountBadge,
                {
                  opacity: entranceAnim,
                  transform: [{ 
                    translateY: entranceAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 0],
                    })
                  }],
                },
              ]}
            >
              <Text style={styles.giftCountText}>
                🎁 {center?.available_gifts ?? 0} gift{(center?.available_gifts ?? 0) !== 1 ? 's' : ''} available
              </Text>
            </Animated.View>
            
            {/* Three gift slots */}
            {[0, 1, 2].map(renderSlot)}
            
            {/* Leave Gift button with pulse animation */}
            <Animated.View
              style={[
                styles.leaveGiftButton,
                {
                  left: SCREEN_WIDTH * LEAVE_GIFT_X_RATIO,
                  top: SCALED_HEIGHT * LEAVE_GIFT_Y_RATIO,
                  transform: [
                    { scale: Animated.multiply(pulseAnim, leaveGiftScale) },
                  ],
                },
              ]}
            >
              <TouchableOpacity
                onPress={handleLeaveGiftPress}
                disabled={giving}
                activeOpacity={0.8}
              >
                <Image
                  source={require('../../assets/images/screens/community-center-leave-gift.png')}
                  style={styles.leaveGiftImage}
                  contentFit="contain"
                />
                {giving && (
                  <View style={styles.leaveGiftSpinner}>
                    <ActivityIndicator color="#fff" size="small" />
                  </View>
                )}
              </TouchableOpacity>
            </Animated.View>
            
            {/* Cooldown message - live countdown */}
            {liveCooldown > 0 && (
              <View style={styles.cooldownBadge}>
                <Text style={styles.cooldownText}>
                  ⏱️ {Math.floor(liveCooldown / 60)}:{(liveCooldown % 60).toString().padStart(2, '0')} until you can give again
                </Text>
              </View>
            )}
          </>
        )}
      </View>
      
      {/* Flying ticket animation */}
      {flyingTicket && (
        <Animated.View
          style={[
            styles.flyingTicket,
            {
              transform: [
                {
                  translateX: ticketFlyAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [flyingTicket.startX, ticketTargetPos.x],
                  }),
                },
                {
                  translateY: ticketFlyAnim.interpolate({
                    inputRange: [0, 0.3, 1],
                    outputRange: [flyingTicket.startY, flyingTicket.startY - 100, ticketTargetPos.y],
                  }),
                },
                { scale: ticketFlyScale },
                {
                  rotate: ticketFlyAnim.interpolate({
                    inputRange: [0, 0.5, 1],
                    outputRange: ['0deg', '15deg', '0deg'],
                  }),
                },
              ],
              opacity: ticketFlyAnim.interpolate({
                inputRange: [0, 0.1, 0.9, 1],
                outputRange: [0, 1, 1, 0],
              }),
            },
          ]}
        >
          <Image
            source={require('../../assets/images/ticket-icon.png')}
            style={styles.flyingTicketImage}
            contentFit="contain"
          />
          <Text style={styles.flyingTicketPlus}>+{flyingTicket.count}</Text>
        </Animated.View>
      )}
      
      {/* Cooldown Modal */}
      <Modal
        isVisible={showCooldownModal}
        onBackdropPress={() => setShowCooldownModal(false)}
        animationIn="zoomIn"
        animationOut="zoomOut"
      >
        <View style={styles.cooldownModalContainer}>
          <View style={styles.cooldownModalIcon}>
            <Text style={styles.cooldownModalIconText}>⏱️</Text>
          </View>
          <View style={styles.cooldownModalContent}>
            <Text style={styles.cooldownModalTitle}>
              {cooldownType === 'claim' ? 'Patience, Shark!' : 'Take a Break!'}
            </Text>
            <Text style={styles.cooldownModalMessage}>
              {cooldownType === 'claim' 
                ? "You've already claimed a gift recently. Wait a bit before claiming another!"
                : "You've already left a gift recently. Wait a bit before leaving another!"}
            </Text>
            <View style={styles.cooldownTimerContainer}>
              <Text style={styles.cooldownTimerLabel}>Time remaining</Text>
              <Text style={styles.cooldownTimerValue}>
                {Math.floor(cooldownSeconds / 60)}:{(cooldownSeconds % 60).toString().padStart(2, '0')}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.cooldownModalButton}
              onPress={() => setShowCooldownModal(false)}
            >
              <Text style={styles.cooldownModalButtonText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Confirm Give Modal */}
      <Modal
        isVisible={showConfirmGiveModal}
        onBackdropPress={() => setShowConfirmGiveModal(false)}
        animationIn="zoomIn"
        animationOut="zoomOut"
      >
        <View style={styles.confirmModalContainer}>
          <View style={styles.confirmModalIcon}>
            <Text style={styles.confirmModalIconText}>🎁</Text>
          </View>
          <View style={styles.confirmModalContent}>
            <Text style={styles.confirmModalTitle}>Leave a Gift, Get Tickets!</Text>
            <Text style={styles.confirmModalMessage}>
              Spend coins to leave a gift for another player — and earn tickets as a thank you! 🎟️
            </Text>
            <View style={styles.exchangeContainer}>
              <View style={styles.exchangeItem}>
                <Image
                  source={require('../../assets/images/screens/community-center-coin.png')}
                  style={styles.exchangeIcon}
                  contentFit="contain"
                />
                <Text style={styles.exchangeValue}>-350</Text>
                <Text style={styles.exchangeLabel}>Coins</Text>
              </View>
              <Text style={styles.exchangeArrow}>→</Text>
              <View style={styles.exchangeItem}>
                <Image
                  source={require('../../assets/images/ticket-icon.png')}
                  style={styles.exchangeIconTicket}
                  contentFit="contain"
                />
                <Text style={styles.exchangeValueGreen}>+2</Text>
                <Text style={styles.exchangeLabel}>Tickets</Text>
              </View>
            </View>
            <View style={styles.confirmButtonRow}>
              <TouchableOpacity
                style={styles.confirmCancelButton}
                onPress={() => setShowConfirmGiveModal(false)}
              >
                <Text style={styles.confirmCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.confirmGiveButton}
                onPress={handleConfirmGive}
              >
                <Text style={styles.confirmGiveText}>Leave Gift!</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      
      {/* Success Modal */}
      <Modal
        isVisible={showSuccessModal}
        onBackdropPress={() => setShowSuccessModal(false)}
        animationIn="zoomIn"
        animationOut="zoomOut"
      >
        <View style={styles.successModalContainer}>
          <View style={styles.successModalIcon}>
            <Text style={styles.successModalIconText}>🎉</Text>
          </View>
          <View style={styles.successModalContent}>
            <Text style={styles.successModalTitle}>
              {successType === 'claim' ? 'Gift Claimed!' : 'Gift Left!'}
            </Text>
            <Text style={styles.successModalMessage}>
              {successType === 'claim' 
                ? `You opened a gift from ${successGiverName}!`
                : 'Your gift is waiting for another player to find!'}
            </Text>
            <View style={styles.rewardContainer}>
              <Image
                source={require('../../assets/images/ticket-icon.png')}
                style={styles.rewardIcon}
                contentFit="contain"
              />
              <Text style={styles.rewardAmount}>+{successType === 'claim' ? '1' : '2'}</Text>
              <Text style={styles.rewardLabel}>Ticket{successType === 'give' ? 's' : ''} earned!</Text>
            </View>
            <TouchableOpacity
              style={styles.successButton}
              onPress={() => setShowSuccessModal(false)}
            >
              <Text style={styles.successButtonText}>Awesome!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Not Enough Coins Modal */}
      <Modal
        isVisible={showNotEnoughCoinsModal}
        onBackdropPress={() => setShowNotEnoughCoinsModal(false)}
        animationIn="zoomIn"
        animationOut="zoomOut"
      >
        <View style={styles.notEnoughModalContainer}>
          <View style={styles.notEnoughModalIcon}>
            <Text style={styles.notEnoughModalIconText}>🪙</Text>
          </View>
          <View style={styles.notEnoughModalContent}>
            <Text style={styles.notEnoughModalTitle}>Not Enough Coins!</Text>
            <Text style={styles.notEnoughModalMessage}>
              You need 350 coins to leave a gift for the community.
            </Text>
            <View style={styles.coinCompareContainer}>
              <View style={styles.coinCompareItem}>
                <Text style={styles.coinCompareLabel}>You have</Text>
                <View style={styles.coinCompareRow}>
                  <Image
                    source={require('../../assets/images/screens/community-center-coin.png')}
                    style={styles.coinCompareIcon}
                    contentFit="contain"
                  />
                  <Text style={styles.coinCompareValueRed}>{player?.coins ?? 0}</Text>
                </View>
              </View>
              <View style={styles.coinCompareDivider} />
              <View style={styles.coinCompareItem}>
                <Text style={styles.coinCompareLabel}>Required</Text>
                <View style={styles.coinCompareRow}>
                  <Image
                    source={require('../../assets/images/screens/community-center-coin.png')}
                    style={styles.coinCompareIcon}
                    contentFit="contain"
                  />
                  <Text style={styles.coinCompareValueGreen}>350</Text>
                </View>
              </View>
            </View>
            <Text style={styles.notEnoughHint}>
              Collect more coins by completing tasks around the park!
            </Text>
            <TouchableOpacity
              style={styles.notEnoughButton}
              onPress={() => setShowNotEnoughCoinsModal(false)}
            >
              <Text style={styles.notEnoughButtonText}>Got it!</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
      {/* Error Modal */}
      <Modal
        isVisible={showErrorModal}
        onBackdropPress={() => setShowErrorModal(false)}
        animationIn="zoomIn"
        animationOut="zoomOut"
      >
        <View style={styles.errorModalContainer}>
          <View style={styles.errorModalIcon}>
            <Text style={styles.errorModalIconText}>😅</Text>
          </View>
          <View style={styles.errorModalContent}>
            <Text style={styles.errorModalTitle}>Whoops!</Text>
            <Text style={styles.errorModalMessage}>{errorMessage}</Text>
            <TouchableOpacity
              style={styles.errorModalButton}
              onPress={() => setShowErrorModal(false)}
            >
              <Text style={styles.errorModalButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0a1628',
  },
  background: {
    width: SCREEN_WIDTH,
  },
  videoBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  goBackContainer: {
    position: 'absolute',
    bottom: 80,
    alignSelf: 'center',
    zIndex: 100,
  },
  goBackImage: {
    width: 180,
    height: 55,
  },
  currencyDisplay: {
    position: 'absolute',
    top: 60,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 100,
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: 12,
  },
  coinIcon: {
    width: 24,
    height: 24,
    marginRight: 6,
  },
  coinText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: '#fbbf24',
  },
  ticketIcon: {
    width: 28,
    height: 20,
    marginRight: 6,
  },
  ticketText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: '#f472b6',
  },
  flyingTicket: {
    position: 'absolute',
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flyingTicketImage: {
    width: 56,
    height: 40,
  },
  flyingTicketPlus: {
    position: 'absolute',
    fontFamily: 'Shark',
    fontSize: 24,
    color: '#4ade80',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
    top: -8,
    right: -8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  giftCountBadge: {
    position: 'absolute',
    top: 120,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 10,
    zIndex: 50,
  },
  giftCountText: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: '#fff',
  },
  slotContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  questionButton: {
    position: 'absolute',
    width: Q_BUTTON_SIZE,
    height: Q_BUTTON_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  questionImage: {
    width: Q_BUTTON_SIZE,
    height: Q_BUTTON_SIZE,
  },
  questionImageDim: {
    opacity: 0.5,
  },
  yourGiftLabel: {
    position: 'absolute',
    bottom: -30,
    left: -20,
    right: -20,
    alignItems: 'center',
  },
  yourGiftText: {
    fontFamily: 'Shark',
    fontSize: 14,
    color: '#4ade80',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 4,
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    overflow: 'hidden',
  },
  bagContainer: {
    alignItems: 'center',
  },
  bagImage: {
    width: 120,
    height: 120,
  },
  claimingSpinner: {
    position: 'absolute',
    top: '50%',
    marginTop: -10,
  },
  giverName: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
    marginTop: 4,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  leaveGiftButton: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
  },
  leaveGiftImage: {
    width: 160,
    height: 65,
  },
  leaveGiftSpinner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 12,
  },
  cooldownBadge: {
    position: 'absolute',
    bottom: 145,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 99,
  },
  cooldownText: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#fbbf24',
  },
  // Cooldown Modal Styles
  cooldownModalContainer: {
    alignItems: 'center',
  },
  cooldownModalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a3a5c',
    borderWidth: 4,
    borderColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    marginBottom: -40,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
  },
  cooldownModalIconText: {
    fontSize: 36,
  },
  cooldownModalContent: {
    backgroundColor: '#1a3a5c',
    borderRadius: 20,
    width: '90%',
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderWidth: 3,
    borderColor: '#3b82f6',
    alignItems: 'center',
  },
  cooldownModalTitle: {
    fontFamily: 'Shark',
    fontSize: 24,
    color: '#f59e0b',
    marginBottom: 12,
    textAlign: 'center',
  },
  cooldownModalMessage: {
    fontFamily: 'Knockout',
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  cooldownTimerContainer: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 16,
    paddingHorizontal: 30,
    paddingVertical: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  cooldownTimerLabel: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  cooldownTimerValue: {
    fontFamily: 'Shark',
    fontSize: 36,
    color: '#4ade80',
  },
  cooldownModalButton: {
    backgroundColor: '#4ade80',
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 14,
    shadowColor: '#4ade80',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  cooldownModalButtonText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
  },
  // Confirm Give Modal Styles
  confirmModalContainer: {
    alignItems: 'center',
  },
  confirmModalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a3a5c',
    borderWidth: 4,
    borderColor: '#4ade80',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    marginBottom: -40,
    shadowColor: '#4ade80',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
  },
  confirmModalIconText: {
    fontSize: 36,
  },
  confirmModalContent: {
    backgroundColor: '#1a3a5c',
    borderRadius: 20,
    width: '90%',
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderWidth: 3,
    borderColor: '#3b82f6',
    alignItems: 'center',
  },
  confirmModalTitle: {
    fontFamily: 'Shark',
    fontSize: 24,
    color: '#4ade80',
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmModalMessage: {
    fontFamily: 'Knockout',
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  exchangeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 24,
    width: '100%',
  },
  exchangeItem: {
    alignItems: 'center',
    flex: 1,
  },
  exchangeIcon: {
    width: 40,
    height: 40,
    marginBottom: 4,
  },
  exchangeIconTicket: {
    width: 48,
    height: 34,
    marginBottom: 4,
  },
  exchangeValue: {
    fontFamily: 'Shark',
    fontSize: 24,
    color: '#ef4444',
  },
  exchangeValueGreen: {
    fontFamily: 'Shark',
    fontSize: 24,
    color: '#4ade80',
  },
  exchangeLabel: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginTop: 2,
  },
  exchangeArrow: {
    fontSize: 24,
    color: 'rgba(255,255,255,0.5)',
    marginHorizontal: 10,
  },
  confirmButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  confirmCancelButton: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  confirmCancelText: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: 'rgba(255,255,255,0.7)',
  },
  confirmGiveButton: {
    backgroundColor: '#4ade80',
    borderRadius: 14,
    paddingHorizontal: 24,
    paddingVertical: 14,
    shadowColor: '#4ade80',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  confirmGiveText: {
    fontFamily: 'Shark',
    fontSize: 16,
    color: 'white',
  },
  // Success Modal Styles
  successModalContainer: {
    alignItems: 'center',
  },
  successModalIcon: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#1a3a5c',
    borderWidth: 4,
    borderColor: '#fbbf24',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    marginBottom: -45,
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 20,
    elevation: 10,
  },
  successModalIconText: {
    fontSize: 44,
  },
  successModalContent: {
    backgroundColor: '#1a3a5c',
    borderRadius: 20,
    width: '90%',
    paddingTop: 55,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderWidth: 3,
    borderColor: '#fbbf24',
    alignItems: 'center',
  },
  successModalTitle: {
    fontFamily: 'Shark',
    fontSize: 28,
    color: '#fbbf24',
    marginBottom: 12,
    textAlign: 'center',
  },
  successModalMessage: {
    fontFamily: 'Knockout',
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  rewardContainer: {
    backgroundColor: 'rgba(74, 222, 128, 0.2)',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#4ade80',
    paddingHorizontal: 30,
    paddingVertical: 16,
    marginBottom: 24,
    alignItems: 'center',
  },
  rewardIcon: {
    width: 56,
    height: 40,
    marginBottom: 4,
  },
  rewardAmount: {
    fontFamily: 'Shark',
    fontSize: 36,
    color: '#4ade80',
  },
  rewardLabel: {
    fontFamily: 'Knockout',
    fontSize: 14,
    color: '#4ade80',
    marginTop: 2,
  },
  successButton: {
    backgroundColor: '#fbbf24',
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 14,
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  successButtonText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: '#1a1a1a',
    textAlign: 'center',
  },
  // Not Enough Coins Modal Styles
  notEnoughModalContainer: {
    alignItems: 'center',
  },
  notEnoughModalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a3a5c',
    borderWidth: 4,
    borderColor: '#ef4444',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    marginBottom: -40,
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
  },
  notEnoughModalIconText: {
    fontSize: 36,
  },
  notEnoughModalContent: {
    backgroundColor: '#1a3a5c',
    borderRadius: 20,
    width: '90%',
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderWidth: 3,
    borderColor: '#ef4444',
    alignItems: 'center',
  },
  notEnoughModalTitle: {
    fontFamily: 'Shark',
    fontSize: 24,
    color: '#ef4444',
    marginBottom: 12,
    textAlign: 'center',
  },
  notEnoughModalMessage: {
    fontFamily: 'Knockout',
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  coinCompareContainer: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginBottom: 16,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
  },
  coinCompareItem: {
    flex: 1,
    alignItems: 'center',
  },
  coinCompareLabel: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    marginBottom: 4,
  },
  coinCompareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  coinCompareIcon: {
    width: 24,
    height: 24,
  },
  coinCompareValueRed: {
    fontFamily: 'Shark',
    fontSize: 20,
    color: '#ef4444',
  },
  coinCompareValueGreen: {
    fontFamily: 'Shark',
    fontSize: 20,
    color: '#4ade80',
  },
  coinCompareDivider: {
    width: 1,
    height: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 16,
  },
  notEnoughHint: {
    fontFamily: 'Knockout',
    fontSize: 13,
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  notEnoughButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 14,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  notEnoughButtonText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: 'white',
    textAlign: 'center',
  },
  // Error Modal Styles
  errorModalContainer: {
    alignItems: 'center',
  },
  errorModalIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#1a3a5c',
    borderWidth: 4,
    borderColor: '#f59e0b',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
    marginBottom: -40,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 15,
    elevation: 10,
  },
  errorModalIconText: {
    fontSize: 36,
  },
  errorModalContent: {
    backgroundColor: '#1a3a5c',
    borderRadius: 20,
    width: '90%',
    paddingTop: 50,
    paddingBottom: 24,
    paddingHorizontal: 24,
    borderWidth: 3,
    borderColor: '#f59e0b',
    alignItems: 'center',
  },
  errorModalTitle: {
    fontFamily: 'Shark',
    fontSize: 24,
    color: '#f59e0b',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorModalMessage: {
    fontFamily: 'Knockout',
    fontSize: 15,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  errorModalButton: {
    backgroundColor: '#f59e0b',
    borderRadius: 14,
    paddingHorizontal: 40,
    paddingVertical: 14,
    shadowColor: '#f59e0b',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  errorModalButtonText: {
    fontFamily: 'Shark',
    fontSize: 18,
    color: '#1a1a1a',
    textAlign: 'center',
  },
});
