import { useContext, useState, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Pressable,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import LottieView from 'lottie-react-native';
import axios from 'axios';
import { PrepItemType } from '../models/prep-item-type';
import { AuthContext } from '../context/AuthProvider';
import { LocationContext } from '../context/LocationProvider';
import { useCurrencyFly } from '../context/CurrencyFlyProvider';
import { CurrencyContext } from '../context/CurrencyProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import redeemPrepItem from '../api/endpoints/me/prep-items/redeem';
import Box from './RedeemModal/Box';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';
import config from '../config';
import HapticPatterns from '../helpers/hapticPatterns';
import prepItemImage from '../helpers/prepItemImages';
import type { RedeemPrepItemResponseType } from '../models/redeem-prep-item-response-type';

// Local asset icons for currency fly (must be hoisted to module level)
const TICKET_ICON = require('../../assets/images/ticket-icon.png');
import {
  FloatingNumber,
  StarBurst,
  CelebrationLevel,
} from './CelebrationEffects';

// Map rarity number to celebration level
const RARITY_TO_CELEBRATION: Record<number, CelebrationLevel> = {
  1: 'common',
  2: 'uncommon',
  3: 'rare',
  4: 'epic',
  5: 'legendary',
};

interface Props {
  visible: boolean;
  prepItem: PrepItemType | null;
  pivotId: number | null;
  onClose: () => void;
  onCollected: () => void;
  onUnavailable?: () => void;
  onViewSet?: (slug: string) => void;
  redeemItem?: typeof redeemPrepItem;
}

/**
 * Modal for collecting a prep item.
 * Styled to match app's AAA quality standards.
 */
export default function PrepItemRedeemModal({
  visible,
  prepItem,
  pivotId,
  onClose,
  onCollected,
  onUnavailable,
  onViewSet,
  redeemItem = redeemPrepItem,
}: Props) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [collectError, setCollectError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [showRewards, setShowRewards] = useState(false);
  const [rewards, setRewards] = useState<{
    energy: number;
    tickets: number;
    coins: number;
    experience: number;
  } | null>(null);
  const [streakInfo, setStreakInfo] = useState<{
    current: number;
    multiplier: number;
  } | null>(null);
  const [pickupOutcome, setPickupOutcome] = useState<Pick<
    RedeemPrepItemResponseType['data'],
    'is_new_variant' | 'replayed' | 'set_progress' | 'project_update'
  > | null>(null);
  const { refreshPlayer } = useContext(AuthContext);
  const { location, latestLocationSampleRef, permissionGranted, requestLocation } = useContext(LocationContext);
  const { triggerFly } = useCurrencyFly();
  const { currencies } = useContext(CurrencyContext);
  const { playSound } = useContext(SoundEffectContext);

  // Animation refs for collect celebration
  const itemScale = useRef(new Animated.Value(1)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const [showStarBurst, setShowStarBurst] = useState(false);
  const [showFloatingRewards, setShowFloatingRewards] = useState(false);
  const lottieRef = useRef<LottieView>(null);
  const reportedCollectedPivotRef = useRef<number | null>(null);

  const handleCollect = async () => {
    if (!prepItem || !pivotId || isCollecting) return;

    // Prefer the latest GPS sample over a map position filtered for visual drift.
    // The server still verifies that the guest is within the home pickup radius.
    const latestSample = latestLocationSampleRef.current;
    const recentSample = latestSample && Date.now() - latestSample.timestamp <= 15000
      ? latestSample : null;
    const pickupLocation = recentSample ?? location;
    if (pickupLocation?.latitude == null || pickupLocation?.longitude == null) {
      HapticPatterns.error();
      if (permissionGranted) {
        requestLocation();
        setCollectError('Finding your location. Stay near this find and tap Retry.');
      } else {
        setCollectError('Turn on Location access for Theme Park Shark to collect this find.');
      }
      return;
    }

    setIsCollecting(true);
    setCollectError(null);
    setUnavailable(false);
    
    const celebrationLevel = RARITY_TO_CELEBRATION[prepItem.rarity] || 'common';

    try {
      const response = await redeemItem(
        prepItem.id,
        pivotId,
        pickupLocation.latitude,
        pickupLocation.longitude
      );

      setRewards(response.data.rewards);
      setStreakInfo(response.data.streak);
      setPickupOutcome({
        is_new_variant: response.data.is_new_variant,
        replayed: response.data.replayed,
        set_progress: response.data.set_progress,
        project_update: response.data.project_update,
      });
      if (!response.data.replayed) {
        HapticPatterns.collect(celebrationLevel);
        playSound(require('../../assets/sounds/reward.mp3'));
      } else {
        HapticPatterns.buttonTap();
      }
      if (reportedCollectedPivotRef.current !== pivotId) {
        reportedCollectedPivotRef.current = pivotId;
        onCollected();
      }
      
      // Fly reward icons to correct header targets
      const screenCenterX = Dimensions.get('window').width / 2;
      const screenCenterY = Dimensions.get('window').height / 2;
      
      if (!response.data.replayed && response.data.rewards.coins > 0 && currencies[0]?.icon_url) {
        triggerFly({
          imageUrl: currencies[0].icon_url,
          amount: Math.min(response.data.rewards.coins, 8),
          startX: screenCenterX,
          startY: screenCenterY,
          targetPosition: 'coins',
        });
      }
      if (!response.data.replayed && response.data.rewards.tickets > 0) {
        triggerFly({
          imageSource: TICKET_ICON,
          amount: Math.min(response.data.rewards.tickets, 6),
          startX: screenCenterX,
          startY: screenCenterY + 20,
          targetPosition: 'tickets',
        });
      }
      
      // Play celebration animations
      if (!response.data.replayed) playCollectAnimation(prepItem.rarity);
      
      setShowRewards(true);

      // The pickup receipt is authoritative even if a later profile refresh fails.
      refreshPlayer().catch(() => {});
    } catch (error) {
      console.error('Failed to collect prep item:', error);
      HapticPatterns.error();
      const serverError = axios.isAxiosError(error)
        ? (error.response?.data as { error?: string } | undefined)?.error
        : null;
      if (axios.isAxiosError(error) && error.response?.status === 410) {
        setUnavailable(true);
        onUnavailable?.();
      }
      setCollectError(typeof serverError === 'string'
        ? serverError
        : 'Could not confirm this pickup. Tap Retry to check it safely.');
    } finally {
      setIsCollecting(false);
    }
  };

  // Play the collect celebration animation
  const playCollectAnimation = (rarity: number) => {
    // Item pop animation
    Animated.sequence([
      Animated.timing(itemScale, {
        toValue: 1.3,
        duration: 150,
        useNativeDriver: true,
      }),
      Animated.spring(itemScale, {
        toValue: 1,
        friction: 3,
        useNativeDriver: true,
      }),
    ]).start();

    // Screen glow for rare+
    if (rarity >= 3) {
      Animated.sequence([
        Animated.timing(glowOpacity, {
          toValue: 0.4,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(glowOpacity, {
          toValue: 0,
          duration: 500,
          useNativeDriver: true,
        }),
      ]).start();
    }

    // Star burst for rare+
    if (rarity >= 3) {
      setShowStarBurst(true);
      setTimeout(() => setShowStarBurst(false), 1000);
    }

    // Floating rewards
    setTimeout(() => setShowFloatingRewards(true), 300);
    setTimeout(() => setShowFloatingRewards(false), 2000);

    // Play Lottie confetti for epic+
    if (rarity >= 4) {
      lottieRef.current?.play();
    }
  };

  const handleDone = () => {
    HapticPatterns.buttonTap();
    setShowRewards(false);
    setRewards(null);
    setPickupOutcome(null);
    setCollectError(null);
    setUnavailable(false);
    setShowFloatingRewards(false);
    onClose();
  };

  const handleViewSet = () => {
    if (!prepItem?.set_slug || !onViewSet) return;
    const slug = prepItem.set_slug;
    handleDone();
    onViewSet(slug);
  };

  // Trigger haptic when modal opens
  useEffect(() => {
    if (visible && prepItem) {
      HapticPatterns.modalOpen();
      setCollectError(null);
      setUnavailable(false);
    }
  }, [visible, prepItem]);

  if (!prepItem) return null;

  // Outer modal colors (solid, like task modal's #0788e4)
  const outerColors = {
    1: '#0788e4',   // Common - task blue
    2: '#e8a000',   // Uncommon - gold
    3: '#0a9a78',   // Rare - lagoon green (never purple)
    4: '#E91E63',   // Epic - pink
    5: '#FF6F00',   // Legendary - orange
  };

  // Inner box colors (like Box component's backgrounds)
  const innerColors = {
    1: '#4cdcff',   // Common - cyan (matches task)
    2: '#ffe7a2',   // Uncommon - light gold (matches coin)
    3: '#c8f3e3',   // Rare - light lagoon
    4: '#ffccdd',   // Epic - light pink
    5: '#fff4cc',   // Legendary - light gold
  };

  // Border colors for inner box
  const borderColors = {
    1: '#0d3249',   // Common
    2: '#3d4a24',   // Uncommon
    3: '#0d4d3d',   // Rare
    4: '#6a2a3a',   // Epic
    5: '#5a4a1a',   // Legendary
  };

  const rarityConfig = {
    label: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary'][prepItem.rarity - 1] || 'Common',
    color: [null, '#4CAF50', config.secondary, '#0a9a78', '#E91E63', '#FFD700'][prepItem.rarity] || '#4CAF50',
    glowColor: [null, '#4CAF50', config.secondary, '#0a9a78', '#E91E63', '#FFD700'][prepItem.rarity] || '#4CAF50',
    outerBg: outerColors[prepItem.rarity as keyof typeof outerColors] || '#0788e4',
    innerBg: innerColors[prepItem.rarity as keyof typeof innerColors] || '#4cdcff',
    borderColor: borderColors[prepItem.rarity as keyof typeof borderColors] || '#0d3249',
  };
  
  // Get local churro image if available
  const getLocalChurroImage = (name: string) => {
    const CHURRO_IMAGES: Record<string, any> = {
      'classic cinnamon': require('../../assets/images/prep-items/churros/churro_01.png'),
      'sugar dusted': require('../../assets/images/prep-items/churros/churro_02.png'),
      'honey glazed': require('../../assets/images/prep-items/churros/churro_03.png'),
      'brown sugar': require('../../assets/images/prep-items/churros/churro_04.png'),
      'maple swirl': require('../../assets/images/prep-items/churros/churro_05.png'),
      'vanilla bean': require('../../assets/images/prep-items/churros/churro_06.png'),
      'caramel drizzle': require('../../assets/images/prep-items/churros/churro_07.png'),
      'dulce de leche': require('../../assets/images/prep-items/churros/churro_08.png'),
      'butterscotch': require('../../assets/images/prep-items/churros/churro_09.png'),
      'toasted coconut': require('../../assets/images/prep-items/churros/churro_10.png'),
      'churro original': require('../../assets/images/prep-items/churros/churro_11.png'),
      'cinnamon toast': require('../../assets/images/prep-items/churros/churro_12.png'),
      'golden crisp': require('../../assets/images/prep-items/churros/churro_13.png'),
      'sweet cream': require('../../assets/images/prep-items/churros/churro_14.png'),
      'salted caramel': require('../../assets/images/prep-items/churros/churro_15.png'),
      'toffee crunch': require('../../assets/images/prep-items/churros/churro_16.png'),
      'praline': require('../../assets/images/prep-items/churros/churro_17.png'),
      'snickerdoodle': require('../../assets/images/prep-items/churros/churro_18.png'),
      'biscoff': require('../../assets/images/prep-items/churros/churro_19.png'),
      'cookie butter': require('../../assets/images/prep-items/churros/churro_20.png'),
      'chocolate dipped': require('../../assets/images/prep-items/churros/churro_21.png'),
      'strawberry frosted': require('../../assets/images/prep-items/churros/churro_22.png'),
      'blueberry bliss': require('../../assets/images/prep-items/churros/churro_23.png'),
      'matcha green tea': require('../../assets/images/prep-items/churros/churro_24.png'),
      'ube purple yam': require('../../assets/images/prep-items/churros/churro_25.png'),
      'red velvet': require('../../assets/images/prep-items/churros/churro_26.png'),
      'orange creamsicle': require('../../assets/images/prep-items/churros/churro_27.png'),
      'lemon zest': require('../../assets/images/prep-items/churros/churro_28.png'),
      'mint chocolate': require('../../assets/images/prep-items/churros/churro_29.png'),
      'cookies & cream': require('../../assets/images/prep-items/churros/churro_30.png'),
      'pumpkin spice': require('../../assets/images/prep-items/churros/churro_31.png'),
      'birthday cake': require('../../assets/images/prep-items/churros/churro_32.png'),
      'cotton candy': require('../../assets/images/prep-items/churros/churro_33.png'),
      'tropical mango': require('../../assets/images/prep-items/churros/churro_34.png'),
      'galaxy swirl': require('../../assets/images/prep-items/churros/churro_35.png'),
      'electric blue': require('../../assets/images/prep-items/churros/churro_36.png'),
      'watermelon wave': require('../../assets/images/prep-items/churros/churro_37.png'),
      'sunset orange': require('../../assets/images/prep-items/churros/churro_38.png'),
      'golden churro': require('../../assets/images/prep-items/churros/churro_39.png'),
      'rainbow galaxy': require('../../assets/images/prep-items/churros/churro_40.png'),
      'default': require('../../assets/images/prep-items/churros/base_churro.png'),
    };
    const lowerName = name.toLowerCase().replace(' churro', '').trim();
    return CHURRO_IMAGES[lowerName] || CHURRO_IMAGES['default'];
  };
  
  const itemImage = prepItemImage(prepItem.variant_slug)
    || (prepItem.name.toLowerCase().includes('churro')
      ? getLocalChurroImage(prepItem.name)
      : (prepItem.icon_url ? { uri: prepItem.icon_url } : require('../../assets/images/screens/player/gift.png')));
  const setProgress = pickupOutcome?.set_progress;
  const starter = setProgress?.starter_milestone;
  const rewardReady = !!(starter?.is_unlocked && !starter.rewards_claimed)
    || !!(setProgress?.is_complete && !setProgress.rewards_claimed);
  const spareReady = !pickupOutcome?.is_new_variant && !pickupOutcome?.replayed
    && !setProgress?.is_complete && !!setProgress?.exchange_cost
    && (setProgress?.spare_count ?? 0) >= setProgress.exchange_cost;
  const progressLabel = pickupOutcome?.replayed
    ? 'PICKUP CONFIRMED'
    : pickupOutcome?.is_new_variant
      ? 'NEW SET FIND!'
      : 'SPARE ADDED!';

  return (
    <Modal
      animationIn="zoomIn"
      animationOut="zoomOut"
      isVisible={visible}
      onBackdropPress={() => {
        if (!isCollecting) {
          if (showRewards) handleDone();
          else onClose();
        }
      }}
      onBackButtonPress={() => {
        if (!isCollecting) {
          if (showRewards) handleDone();
          else onClose();
        }
      }}
    >
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <View
          style={{
            width: Dimensions.get('window').width - 40,
            position: 'relative',
            alignItems: 'center',
          }}
        >
          {/* Ribbon Header */}
          <Ribbon text={showRewards
            ? pickupOutcome?.replayed ? 'Already collected' : 'Collected!'
            : 'Prep Item'} />

          {/* Main Content Box - matches task modal structure exactly */}
          <View
            style={{
              backgroundColor: rarityConfig.outerBg,
              borderRadius: 16,
              marginTop: '-10%',
              width: '85%',
              zIndex: 10,
              paddingTop: 16,
              paddingLeft: 16,
              paddingRight: 16,
              paddingBottom: 8,
              shadowColor: '#000',
              shadowOffset: { width: 2, height: 2 },
              shadowRadius: 0,
              shadowOpacity: 0.4,
              borderColor: 'rgba(0, 0, 0, .4)',
              borderWidth: 2,
            }}
          >
            {/* Inner content area - matches task modal's inner structure */}
            <View
              style={{
                paddingTop: 16,
                paddingBottom: 16,
                paddingLeft: 16,
                paddingRight: 16,
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                borderColor: 'rgba(0, 0, 0, .6)',
                borderLeftWidth: 2,
                borderRightWidth: 2,
                borderBottomWidth: 2,
                borderBottomLeftRadius: 16,
                borderBottomRightRadius: 16,
                overflow: 'hidden',
              }}
            >
                {/* Screen glow for rare+ items */}
                <Animated.View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: rarityConfig.glowColor,
                    opacity: glowOpacity,
                  }}
                  pointerEvents="none"
                />

                {/* Lottie confetti for epic+ items */}
                {prepItem.rarity >= 4 && !pickupOutcome?.replayed && (
                  <LottieView
                    ref={lottieRef}
                    source={require('../../assets/animations/confetti.json')}
                    style={{
                      position: 'absolute',
                      width: '150%',
                      height: '150%',
                      left: '-25%',
                      top: '-25%',
                    }}
                    loop={false}
                  />
                )}

                {/* Star burst effect */}
                {showStarBurst && (
                  <View style={{ position: 'absolute', top: '30%', alignSelf: 'center' }}>
                    <StarBurst visible color={rarityConfig.color} count={prepItem.rarity >= 5 ? 12 : 8} />
                  </View>
                )}

                {!showRewards ? (
                  // Pre-collect view - matches task modal structure exactly
                  <>
                    {/* Main item Box - same as task modal */}
                    <Box
                      background={require('../../assets/images/screens/explore/starburst.png')}
                      image={itemImage}
                      text={prepItem.name}
                      type="task"
                      pulse
                    />
                    
                    {/* Reward boxes row - same layout as task modal */}
                    <View
                      style={{
                        marginLeft: -4,
                        marginRight: -4,
                        marginTop: 8,
                        flexDirection: 'row',
                        justifyContent: 'center',
                      }}
                    >
                      {prepItem.energy_reward > 0 && (
                        <View
                          style={{
                            width: '33.3333333%',
                            paddingLeft: 4,
                            paddingRight: 4,
                          }}
                        >
                          <Box
                            backgroundColor="#d4f7d4"
                            image={require('../../assets/images/energy.png')}
                            text={prepItem.energy_reward}
                            small
                            type="task"
                          />
                        </View>
                      )}
                      {prepItem.ticket_reward > 0 && (
                        <View
                          style={{
                            width: '33.3333333%',
                            paddingLeft: 4,
                            paddingRight: 4,
                          }}
                        >
                          <Box
                            backgroundColor="#fff3d4"
                            image={require('../../assets/images/ticket-icon.png')}
                            text="CHANCE"
                            small
                            type="task"
                          />
                        </View>
                      )}
                      {prepItem.experience_reward > 0 && (
                        <View
                          style={{
                            width: '33.3333333%',
                            paddingLeft: 4,
                            paddingRight: 4,
                          }}
                        >
                          <Box
                            backgroundColor="#4cdcff"
                            image={require('../../assets/images/screens/explore/xp.png')}
                            text={prepItem.experience_reward}
                            small
                            type="task"
                          />
                        </View>
                      )}
                    </View>
                    {prepItem.ticket_reward > 0 && (
                      <Text
                        accessibilityRole="text"
                        style={{
                          fontFamily: 'Knockout',
                          fontSize: 14,
                          color: '#fff',
                          textAlign: 'center',
                          marginTop: 7,
                        }}
                      >
                        TICKET CHANCE · COINS IF NO TICKET
                      </Text>
                    )}
                  </>
                ) : (
                  // Post-collect view
                  <>
                    {/* Floating reward numbers */}
                    {showFloatingRewards && rewards && !pickupOutcome?.replayed && (
                      <View style={{ position: 'absolute', top: 20, alignSelf: 'center', zIndex: 100 }}>
                        {rewards.energy > 0 && (
                          <FloatingNumber
                            value={rewards.energy}
                            label="Energy"
                            color="#4CAF50"
                            delay={0}
                          />
                        )}
                        {rewards.tickets > 0 && (
                          <FloatingNumber
                            value={rewards.tickets}
                            label={rewards.tickets === 1 ? 'Ticket' : 'Tickets'}
                            color="#FF9800"
                            delay={200}
                          />
                        )}
                        {rewards.experience > 0 && (
                          <FloatingNumber
                            value={rewards.experience}
                            label="XP"
                            color={config.tertiary}
                            delay={400}
                          />
                        )}
                      </View>
                    )}

                    <Text
                      style={{
                        fontFamily: 'Shark',
                        fontSize: 28,
                        color: config.tertiary,
                        textAlign: 'center',
                        textTransform: 'uppercase',
                        textShadowColor: '#05346e',
                        textShadowOffset: { width: 2, height: 2 },
                        textShadowRadius: 0,
                        marginBottom: 8,
                        marginTop: 16,
                      }}
                    >
                      {pickupOutcome?.replayed ? 'Already in your book'
                        : prepItem.rarity >= 4 ? 'Epic find!'
                        : prepItem.rarity >= 3 ? 'Rare find!' : 'Got it!'}
                    </Text>

                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        fontSize: 18,
                        color: 'white',
                        textAlign: 'center',
                        marginBottom: 8,
                      }}
                    >
                      {prepItem.name}
                    </Text>

                    {!!pickupOutcome?.project_update?.points_awarded && (
                      <View style={{
                        alignSelf: 'stretch', marginTop: 2, marginBottom: 4,
                        borderRadius: 10, borderWidth: 2, borderColor: '#FFE078',
                        backgroundColor: '#07518B', paddingHorizontal: 9, paddingVertical: 6,
                      }} accessible accessibilityRole="text"
                      accessibilityLabel={`${pickupOutcome.replayed ? 'Previously added' : 'Added'} ${pickupOutcome.project_update.points_awarded} to ${pickupOutcome.project_update.title}. Crew progress ${pickupOutcome.project_update.total_points} of ${pickupOutcome.project_update.goal_points}`}>
                        <Text style={{ fontFamily: 'Shark', color: '#FFE078',
                          fontSize: 15, textAlign: 'center' }} numberOfLines={1}>
                          {pickupOutcome.replayed ? 'ALREADY HELPED THE CREW' : 'YOU HELPED THE CREW!'}
                        </Text>
                        <Text style={{ fontFamily: 'Knockout', color: '#fff',
                          fontSize: 15, textAlign: 'center' }} numberOfLines={2}>
                          {pickupOutcome.project_update.title} · {pickupOutcome.replayed
                            ? `Previously added ${pickupOutcome.project_update.points_awarded}`
                            : `+${pickupOutcome.project_update.points_awarded}`} · {pickupOutcome.project_update.total_points}/{pickupOutcome.project_update.goal_points}
                        </Text>
                      </View>
                    )}

                    {/* Rewards Received — actual amounts from API */}
                    {!pickupOutcome?.replayed && <View
                      style={{
                        marginLeft: -4,
                        marginRight: -4,
                        marginTop: 8,
                        flexDirection: 'row',
                        justifyContent: 'center',
                      }}
                    >
                      {rewards && rewards.energy > 0 && (
                        <View
                          style={{
                            width: '33.3333333%',
                            paddingLeft: 4,
                            paddingRight: 4,
                          }}
                        >
                          <Box
                            backgroundColor="#d4f7d4"
                            image={require('../../assets/images/energy.png')}
                            text={`+${rewards.energy}`}
                            small
                            type="task"
                          />
                        </View>
                      )}
                      {rewards && rewards.tickets > 0 && (
                        <View
                          style={{
                            width: '33.3333333%',
                            paddingLeft: 4,
                            paddingRight: 4,
                          }}
                        >
                          <Box
                            backgroundColor="#fff3d4"
                            image={require('../../assets/images/ticket-icon.png')}
                            text={`+${rewards.tickets}`}
                            small
                            type="task"
                          />
                        </View>
                      )}
                      {rewards && rewards.coins > 0 && (
                        <View
                          style={{
                            width: '33.3333333%',
                            paddingLeft: 4,
                            paddingRight: 4,
                          }}
                        >
                          <Box
                            backgroundColor="#ffe7a2"
                            image={require('../../assets/images/coingold.png')}
                            text={`+${rewards.coins}`}
                            small
                            type="coin"
                          />
                        </View>
                      )}
                      {rewards && rewards.experience > 0 && (
                        <View
                          style={{
                            width: '33.3333333%',
                            paddingLeft: 4,
                            paddingRight: 4,
                          }}
                        >
                          <Box
                            backgroundColor="#4cdcff"
                            image={require('../../assets/images/screens/explore/xp.png')}
                            text={`+${rewards.experience}`}
                            small
                            type="task"
                          />
                        </View>
                      )}
                    </View>}
                    {!pickupOutcome?.replayed && streakInfo && streakInfo.current > 0 && (
                      <View style={{ alignSelf: 'center', marginTop: 10,
                        borderRadius: 12, borderWidth: 2, borderColor: '#fff',
                        backgroundColor: '#ffca30', paddingHorizontal: 13, paddingVertical: 6 }}
                        accessible accessibilityRole="text"
                        accessibilityLabel={`${streakInfo.current} day hunt streak${streakInfo.multiplier > 1 ? `, ${streakInfo.multiplier.toFixed(1)} times Energy and experience` : ''}`}>
                        <Text style={{ fontFamily: 'Shark', fontSize: 15,
                          color: '#073b73', textAlign: 'center' }}>
                          DAY {streakInfo.current} HUNT STREAK
                        </Text>
                        {streakInfo.multiplier > 1 && <Text style={{ fontFamily: 'Knockout',
                          fontSize: 14, color: '#073b73', textAlign: 'center' }}>
                          {streakInfo.multiplier.toFixed(1)}× ENERGY + XP
                        </Text>}
                      </View>
                    )}
                    {setProgress && prepItem.set_slug && (
                      <View style={{
                        marginTop: 12, borderWidth: 2, borderColor: '#FFC842',
                        borderRadius: 12, backgroundColor: '#063965', padding: 10,
                      }}>
                        <Text style={{ fontFamily: 'Shark', color: '#FFE078', fontSize: 19,
                          textAlign: 'center', textTransform: 'uppercase' }}>
                          {progressLabel}
                        </Text>
                        <Text style={{ fontFamily: 'Knockout', color: '#fff', fontSize: 17,
                          textAlign: 'center', marginTop: 1 }}>
                          {prepItem.set_name || 'Collection'} · {setProgress.collected}/{setProgress.total} found
                        </Text>
                        <View style={{ height: 9, borderRadius: 5, backgroundColor: '#27638E',
                          borderColor: '#9CDFFF', borderWidth: 1, marginTop: 8, overflow: 'hidden' }}>
                          <View style={{ width: `${Math.min(100, Math.max(0, setProgress.percentage))}%`,
                            height: '100%', backgroundColor: '#FFC842' }} />
                        </View>
                        {rewardReady && (
                          <Text style={{ fontFamily: 'Knockout', color: '#FFE078', fontSize: 15,
                            textAlign: 'center', marginTop: 6 }}>
                            {setProgress.is_complete && !setProgress.rewards_claimed
                              ? 'FULL SET REWARD READY!' : 'TRIP PREP REWARD READY!'}
                          </Text>
                        )}
                        {!pickupOutcome?.is_new_variant && !pickupOutcome?.replayed
                          && setProgress.spare_count != null && !!setProgress.exchange_cost && (
                          <Text style={{ fontFamily: 'Knockout', color: '#FFE078', fontSize: 15,
                            textAlign: 'center', marginTop: 6 }}>
                            {spareReady ? 'SPARE EXCHANGE READY!'
                              : `${setProgress.spare_count}/${setProgress.exchange_cost} spares toward a missing find`}
                          </Text>
                        )}
                        {onViewSet && (
                          <Pressable accessibilityRole="button"
                            accessibilityLabel={rewardReady ? 'Open set book to claim reward'
                              : spareReady ? 'Open set book to exchange spares' : 'Open set book'}
                            onPress={handleViewSet}
                            style={{ alignSelf: 'center', marginTop: 8, paddingHorizontal: 12,
                              paddingVertical: 5, borderRadius: 8, backgroundColor: '#FFC842',
                              borderWidth: 2, borderColor: '#5A3307' }}>
                            <Text style={{ fontFamily: 'Shark', color: '#163C5C', fontSize: 16 }}>
                              {rewardReady ? 'CLAIM IN SET BOOK ›'
                                : spareReady ? 'EXCHANGE IN SET BOOK ›' : 'VIEW SET BOOK ›'}
                            </Text>
                          </Pressable>
                        )}
                      </View>
                    )}
                  </>
                )}
              </View>
            {collectError && (
              <Text style={{ color: '#fff', fontFamily: 'Knockout', fontSize: 15, textAlign: 'center', marginTop: 10 }}>
                {collectError}
              </Text>
            )}
            {/* Button outside inner content - matches task modal exactly */}
            <View style={{ marginTop: 8 }}>
              <YellowButton
                text={showRewards ? pickupOutcome?.replayed ? 'Back to map' : 'Awesome!' : (isCollecting ? 'Collecting...' : unavailable ? 'Back to map' : collectError ? 'Retry' : 'Collect')}
                onPress={showRewards || unavailable ? handleDone : handleCollect}
                disabled={!showRewards && isCollecting}
              />
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}
