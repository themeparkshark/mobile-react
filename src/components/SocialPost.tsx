import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import * as Haptics from 'expo-haptics';
import { useContext, useRef, useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import view from '../api/endpoints/social-posts/view';
import { SocialPostType } from '../models/social-post-type';
import YouTubePlayerModal from './watch/YouTubePlayerModal';
import { formatDuration, isNewVideo, thumbnailFor, videoIdOf } from './watch/watchFeed';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { GameIcon } from '../ui';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';

const COIN_REWARD = 25;

export default function SocialPost({
  socialPost,
  fullWidth = false,
}: {
  readonly socialPost: SocialPostType;
  readonly fullWidth?: boolean;
}) {
  // FlashList recycles this component across videos, so the local "just
  // watched" mark is tied to the video id instead of seeded once from props.
  const [watchedId, setWatchedId] = useState<number | null>(null);
  const hasWatched = socialPost.has_watched || watchedId === socialPost.id;
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [showReward, setShowReward] = useState(false);
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const { refreshPlayer } = useContext(AuthContext);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rewardScale = useRef(new Animated.Value(0)).current;
  const coinBounce = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.95,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 300,
      useNativeDriver: true,
    }).start();
  };

  const showRewardModal = () => {
    setShowReward(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    // Bounce in
    rewardScale.setValue(0);
    coinBounce.setValue(0);
    Animated.spring(rewardScale, {
      toValue: 1,
      friction: 4,
      tension: 200,
      useNativeDriver: true,
    }).start();

    // Coin bounce loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(coinBounce, {
          toValue: -12,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(coinBounce, {
          toValue: 0,
          duration: 300,
          useNativeDriver: true,
        }),
      ])
    ).start();
  };

  const videoId = videoIdOf(socialPost);
  const isNew = isNewVideo(socialPost);
  const duration = socialPost.is_short ? null : formatDuration(socialPost.duration_seconds);

  const recordView = async () => {
    if (hasWatched) return;
    const id = socialPost.id;
    try {
      await view(socialPost);
      setWatchedId(id);
      await refreshPlayer(); // Update coin count in header
      showRewardModal();
    } catch {
      // Already watched or error: just mark it
      setWatchedId(id);
    }
  };

  const handlePress = async () => {
    playSound(require('../../assets/sounds/button_press.mp3'));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (videoId) {
      // Plays in-app; the thank-you is paid when the player closes.
      setPlayingId(videoId);
      return;
    }
    await WebBrowser.openBrowserAsync(socialPost.permalink);
    await recordView();
  };

  const closePlayer = () => {
    setPlayingId(null);
    // Let the player sheet finish sliding away before the reward modal opens
    // (iOS drops a modal presented during another one's dismissal).
    setTimeout(() => { recordView(); }, 450);
  };

  return (
    <>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={{
          flex: 1,
          padding: fullWidth ? 0 : 6,
        }}
      >
        <Animated.View
          style={{
            transform: [{ scale: scaleAnim }],
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: '#1a1a2e',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 5,
          }}
        >
          {/* Thumbnail */}
          <View style={{ width: '100%', aspectRatio: 16 / 9 }}>
            <Image
              source={thumbnailFor(socialPost, fullWidth)}
              recyclingKey={String(socialPost.id)}
              style={{ width: '100%', height: '100%', backgroundColor: '#1f2a44' }}
              contentFit="cover"
              transition={180}
              cachePolicy="memory-disk"
              priority={fullWidth ? 'high' : 'normal'}
              accessibilityIgnoresInvertColors
            />

            {/* NEW: on the channel less than 24 hours */}
            {isNew && (
              <View
                accessible
                accessibilityLabel="New video"
                style={{
                  position: 'absolute',
                  top: 8,
                  left: 8,
                  backgroundColor: '#ef4444',
                  borderRadius: 8,
                  paddingHorizontal: fullWidth ? 10 : 7,
                  paddingVertical: fullWidth ? 4 : 3,
                  borderWidth: 1.5,
                  borderColor: 'white',
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.35,
                  shadowRadius: 3,
                  elevation: 4,
                  zIndex: 2,
                }}
              >
                <Text style={{ fontFamily: 'Shark', fontSize: fullWidth ? 14 : 11, color: 'white', letterSpacing: 1 }}>
                  NEW
                </Text>
              </View>
            )}

            {/* Short or duration chip */}
            {(socialPost.is_short || duration) && (
              <View
                style={{
                  position: 'absolute',
                  bottom: 6,
                  right: 6,
                  backgroundColor: 'rgba(0,0,0,0.78)',
                  borderRadius: 6,
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  zIndex: 2,
                }}
              >
                <Text style={{ fontFamily: 'Knockout', fontSize: 12, color: 'white', letterSpacing: 0.5 }}>
                  {socialPost.is_short ? 'SHORT' : duration}
                </Text>
              </View>
            )}

            {/* Watched overlay */}
            {hasWatched && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: 'rgba(0,0,0,0.5)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <View
                  style={{
                    backgroundColor: 'rgba(34,197,94,0.9)',
                    borderRadius: 20,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                  }}
                >
                  <GameIcon name="check" size={16} />
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 12,
                      color: 'white',
                      textTransform: 'uppercase',
                    }}
                  >
                    Watched
                  </Text>
                </View>
              </View>
            )}

            {/* Coin reward badge — show on unwatched videos */}
            {!hasWatched && (
              <View
                style={{
                  position: 'absolute',
                  top: 8,
                  right: 8,
                  backgroundColor: 'rgba(0,0,0,0.7)',
                  borderRadius: 12,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                <Image
                  source={require('../../assets/images/coingold.png')}
                  style={{ width: 16, height: 16 }}
                  contentFit="contain"
                />
                <Text
                  style={{
                    fontFamily: 'Shark',
                    fontSize: 11,
                    color: '#FFD700',
                  }}
                >
                  +{COIN_REWARD}
                </Text>
              </View>
            )}

            {/* Play button overlay */}
            {!hasWatched && (
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <GameIcon name="play" size={52} accessibilityLabel="Play video" />
              </View>
            )}

            {/* Bottom gradient */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.8)']}
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                height: 50,
              }}
            />
          </View>

          {/* Title bar */}
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 10,
              backgroundColor: '#0f1a2e',
            }}
          >
            <Text
              numberOfLines={2}
              style={{
                fontFamily: 'Knockout',
                fontSize: 13,
                color: 'white',
                lineHeight: 17,
              }}
            >
              {socialPost.title}
            </Text>
          </View>
        </Animated.View>
      </Pressable>

      <YouTubePlayerModal videoId={playingId} title={socialPost.title} onClose={closePlayer} />

      {/* Reward confirmation modal */}
      <Modal
        visible={showReward}
        transparent
        animationType="fade"
        onRequestClose={() => setShowReward(false)}
      >
        <TouchableOpacity
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)',
          }}
          activeOpacity={1}
          onPress={() => setShowReward(false)}
        >
          <Animated.View
            style={{
              backgroundColor: '#0f1a2e',
              borderRadius: 24,
              padding: 32,
              marginHorizontal: 40,
              alignItems: 'center',
              shadowColor: '#FFD700',
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.3,
              shadowRadius: 20,
              elevation: 10,
              borderWidth: 2,
              borderColor: 'rgba(255,215,0,0.3)',
              transform: [{ scale: rewardScale }],
            }}
          >
            {/* Bouncing coin */}
            <Animated.View style={{ transform: [{ translateY: coinBounce }] }}>
              <Image
                source={require('../../assets/images/coingold.png')}
                style={{ width: 64, height: 64, marginBottom: 16 }}
                contentFit="contain"
              />
            </Animated.View>

            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 22,
                color: '#FFD700',
                textTransform: 'uppercase',
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              +{COIN_REWARD} Coins!
            </Text>

            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 16,
                color: 'rgba(255,255,255,0.7)',
                textAlign: 'center',
                lineHeight: 22,
                marginBottom: 20,
              }}
            >
              Thanks for watching! Coins have been added to your account.
            </Text>

            <TouchableOpacity
              onPress={() => setShowReward(false)}
              style={{
                backgroundColor: config.secondary,
                paddingHorizontal: 36,
                paddingVertical: 12,
                borderRadius: 14,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Shark',
                  fontSize: 14,
                  color: 'white',
                  textTransform: 'uppercase',
                }}
              >
                Awesome!
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}
