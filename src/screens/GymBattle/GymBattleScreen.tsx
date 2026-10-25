import React, { useState, useEffect, useCallback, useRef, useMemo, useContext } from 'react';
import {
  AppState,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  ImageBackground,
  Animated,
  Easing,
} from 'react-native';
import { Image } from 'expo-image';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
// LinearGradient removed - not installed
import { BlurView } from 'expo-blur';
import { useFocusEffect } from '@react-navigation/native';
import { getGym, GymData, checkinGym } from '../../api/endpoints/gym-battle';
import TapMiniGameModal from '../../components/GymBattle/TapMiniGameModal';
import SwordAttackModal from '../../components/GymBattle/SwordAttackModal';
import PlaceCoinModal from '../../components/GymBattle/PlaceCoinModal';
import DefendMiniGameModal from '../../components/GymBattle/DefendMiniGameModal';
import { battleHUDEvents } from '../../components/GymBattle/battleHUDEvents';
import { TEAMS, teamName, type TeamId } from '../../constants/teams';
import { GameIcon } from '../../ui';
import useMatchLink from '../../hooks/useMatchLink';
import MatchLinkBanner from '../../components/match/MatchLinkBanner';
import { friendlyActionError, isLinkFailure } from '../../services/match/matchLink';
import { LocationStatusContext } from '../../context/LocationProvider';
import { usePowerBudget } from '../../power';
import Reanimated, { ZoomIn, FadeOut } from 'react-native-reanimated';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
// Bottom edge of the ARENA BATTLE title and the three header cards.
const HEADER_BOTTOM = 180;

// Action row: three equal cells across the floor.
const ACTION_CELL_W = (SCREEN_W - 56) / 3;
// Ready button art, drawn to its visible bounds (the PNGs carry transparent
// rows above and below the button). Sizes are the PNG size and the box that
// holds the visible art, in image pixels.
const READY_ART = {
  defend: { src: require('../../../assets/images/btn-defend.png'), w: 313, h: 155, x: 2, y: 12, vw: 309, vh: 128 },
  checkin: { src: require('../../../assets/images/btn-checkin.png'), w: 332, h: 128, x: 0, y: 0, vw: 332, vh: 127 },
  battle: { src: require('../../../assets/images/btn-battle.png'), w: 314, h: 153, x: 3, y: 16, vw: 309, vh: 127 },
} as const;
type ReadyArtName = keyof typeof READY_ART;
// Every ready button is the same height, as big as the widest one allows.
const READY_H = Math.min(...Object.values(READY_ART).map(a => ACTION_CELL_W * a.vh / a.vw));
// A waiting pill is clearly smaller than a ready button (go outweighs wait).
const WAIT_H = Math.max(34, Math.round(READY_H * 0.78));
const WAIT_W = Math.round(ACTION_CELL_W * 0.84);

// Pillar images
const PILLAR_IMAGES = {
  mouse: require('../../../assets/images/pillar-mouse.png'),
  globe: require('../../../assets/images/pillar-globe.png'),
  shark: require('../../../assets/images/pillar-shark.png'),
};

// Team colours and names come from the one team table (constants/teams).
const TEAM_COLORS: Record<TeamId, string> = { mouse: TEAMS.mouse.color, globe: TEAMS.globe.color, shark: TEAMS.shark.color };
const TEAM_NAMES = { get mouse() { return teamName('mouse'); }, get globe() { return teamName('globe'); }, get shark() { return teamName('shark'); } };

// Animated Pillar Component
const AnimatedPillar = ({ 
  team, 
  isWinner, 
  position, // 'left' | 'center' | 'right'
  score,
  onTap,
}: { 
  team: 'mouse' | 'globe' | 'shark';
  isWinner: boolean;
  position: 'left' | 'center' | 'right';
  score: number;
  onTap?: (team: string) => void;
}) => {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0.3)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const entranceAnim = useRef(new Animated.Value(0)).current;
  const sparkleOpacity = useRef(new Animated.Value(0)).current;
  const tapBounce = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Entrance animation with delay
    const delayMs = position === 'center' ? 0 : position === 'left' ? 200 : 400;
    const timeout = setTimeout(() => {
      Animated.spring(entranceAnim, {
        toValue: 1,
        friction: 6,
        tension: 40,
        useNativeDriver: true,
      }).start();
    }, delayMs);

    // Winner gets extra animations
    if (isWinner) {
      // Pulse animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Glow animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, {
            toValue: 1,
            duration: 1500,
            useNativeDriver: true,
          }),
          Animated.timing(glowAnim, {
            toValue: 0.3,
            duration: 1500,
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Floating animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(floatAnim, {
            toValue: -8,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(floatAnim, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.ease),
            useNativeDriver: true,
          }),
        ])
      ).start();

      // Sparkle animation
      Animated.loop(
        Animated.sequence([
          Animated.timing(sparkleOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
          Animated.timing(sparkleOpacity, {
            toValue: 0,
            duration: 500,
            useNativeDriver: true,
          }),
        ])
      ).start();
    }
    
    return () => clearTimeout(timeout);
  }, [isWinner, position]);

  // Position styles
  const positionStyle = useMemo(() => {
    const aspectRatio = 1.8; // Approximate pillar aspect ratio
    // On short screens (iPhone SE) the winner tower grew up into the header
    // cards. Cap the tower height to the room between the header and the
    // tower bases (58% down), keeping the winner-to-side size ratio.
    const maxWinner = (SCREEN_H * 0.58 - (HEADER_BOTTOM + 22)) / aspectRatio;
    const winnerSize = Math.min(SCREEN_W * 0.45, maxWinner);
    // Short screens: side towers stay close to the winner's size so their
    // crests still read (they sit lower, so they never reach the header).
    const sideRatio = SCREEN_H < 750 ? 0.9 : 0.75;
    const baseSize = isWinner ? winnerSize : Math.min(SCREEN_W * 0.32, winnerSize * sideRatio);
    
    switch (position) {
      case 'left':
        return {
          left: SCREEN_W * 0.02,
          bottom: SCREEN_H * 0.44,
          width: baseSize,
          height: baseSize * aspectRatio,
          zIndex: 1,
        };
      case 'center':
        return {
          left: (SCREEN_W - baseSize) / 2,
          bottom: SCREEN_H * 0.42,
          width: baseSize,
          height: baseSize * aspectRatio,
          zIndex: 3,
        };
      case 'right':
        return {
          right: SCREEN_W * 0.02,
          bottom: SCREEN_H * 0.44,
          width: baseSize,
          height: baseSize * aspectRatio,
          zIndex: 1,
        };
      default:
        return {
          left: (SCREEN_W - baseSize) / 2,
          bottom: SCREEN_H * 0.42,
          width: baseSize,
          height: baseSize * aspectRatio,
          zIndex: 1,
        };
    }
  }, [position, isWinner]);

  const teamColor = TEAM_COLORS[team] || '#FBBF24';

  const handleTap = () => {
    // Bounce animation
    Animated.sequence([
      Animated.spring(tapBounce, {
        toValue: 1.12,
        friction: 3,
        tension: 400,
        useNativeDriver: true,
      }),
      Animated.spring(tapBounce, {
        toValue: 1,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
    
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onTap?.(team);
  };

  return (
    <TouchableOpacity 
      onPress={handleTap} 
      activeOpacity={1}
      style={[styles.pillarContainer, positionStyle]}
    >
      <Animated.View
        style={[
          { width: '100%', height: '100%', alignItems: 'center' },
          {
            opacity: entranceAnim,
            transform: [
              { scale: tapBounce },
              { translateY: floatAnim },
            ],
          },
        ]}
      >
        {/* Winner stage: always fully solid. It breathes in scale only (native
            driver), on a plain wrapper so the navy outline stays in step with
            the fill. */}
        {isWinner && (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.pillarStageWrap,
              {
                transform: [
                  { scale: glowAnim.interpolate({ inputRange: [0.3, 1], outputRange: [1, 1.06] }) },
                ],
              },
            ]}
          >
            <View style={[styles.pillarGlow, { backgroundColor: teamColor }]} />
          </Animated.View>
        )}
        
        {/* Pillar image */}
        <Image
          source={PILLAR_IMAGES[team]}
          style={styles.pillarImage}
          contentFit="contain"
        />

        {/* Winner crown/sparkles */}
        {isWinner && (
          <Animated.View style={[styles.winnerCrown, { opacity: sparkleOpacity }]}>
            <GameIcon name="crown" size={30} />
          </Animated.View>
        )}

        {/* Score badge */}
        <View style={[styles.scoreBadge, { backgroundColor: teamColor }]}>
          {/* The team crest rides on the score, so a non-reader can tell the
              three towers apart on any phone size. */}
          <Image source={TEAMS[team].badge} style={styles.scoreCrest} contentFit="contain" />
          <Text style={styles.scoreText}>{(score ?? 0).toLocaleString()}</Text>
        </View>
      </Animated.View>
    </TouchableOpacity>
  );
};

// Floating particle component
const FloatingParticle = ({ delay, startX, color }: { delay: number; startX: number; color: string }) => {
  const translateY = useRef(new Animated.Value(0)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const animate = () => {
      translateY.setValue(SCREEN_H * 0.7);
      translateX.setValue(0);
      opacity.setValue(0);
      scale.setValue(0.5 + Math.random() * 0.5);

      Animated.parallel([
        Animated.timing(translateY, {
          // Fade out before the header cards, never over their text.
          toValue: HEADER_BOTTOM + 10,
          duration: 4000 + Math.random() * 3000,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.8,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 3000,
            useNativeDriver: true,
          }),
        ]),
        Animated.timing(translateX, {
          toValue: (Math.random() - 0.5) * 100,
          duration: 4000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => { if (finished) animate(); });
    };

    const timeout = setTimeout(animate, delay);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={[
        styles.particle,
        {
          left: startX,
          backgroundColor: color,
          opacity,
          transform: [{ translateY }, { translateX }, { scale }],
        },
      ]}
    />
  );
};

// Animated Button with juicy press effects
const AnimatedButton = ({ 
  onPress, 
  disabled, 
  source, 
  style,
  children,
  noShimmer,
}: { 
  onPress: () => void;
  disabled?: boolean;
  source?: any;
  style?: any;
  children?: React.ReactNode;
  noShimmer?: boolean;
}) => {
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  
  // Idle shimmer animation
  useEffect(() => {
    if (disabled) return;
    
    Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 2000,
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0,
          duration: 2000,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [disabled]);

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.92,
      friction: 5,
      tension: 300,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 200,
      useNativeDriver: true,
    }).start();
  };

  const handlePress = () => {
    // Bounce effect
    Animated.sequence([
      Animated.spring(scaleAnim, {
        toValue: 1.08,
        friction: 3,
        tension: 400,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 4,
        tension: 200,
        useNativeDriver: true,
      }),
    ]).start();
    
    onPress();
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled}
      activeOpacity={1}
      style={[disabled && styles.btnDisabled]}
    >
      <Animated.View
        style={[
          {
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        {source ? (
          <Image
            source={source}
            style={style}
            contentFit="contain"
          />
        ) : children}
        
        {/* Shimmer overlay */}
        {!disabled && !noShimmer && (
          <Animated.View
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: 'white',
              opacity: glowAnim.interpolate({
                inputRange: [0, 0.5, 1],
                outputRange: [0, 0.15, 0],
              }),
              borderRadius: 16,
            }}
            pointerEvents="none"
          />
        )}
      </Animated.View>
    </TouchableOpacity>
  );
};

const clock = (secs: number) => `${Math.floor(secs / 60)}:${(secs % 60).toString().padStart(2, '0')}`;

// A ready button's art, cropped to what you can see, at the row's ready height.
const ReadyArt = ({ name }: { name: ReadyArtName }) => {
  const art = READY_ART[name];
  const s = READY_H / art.vh;
  return (
    <View style={{ width: art.vw * s, height: READY_H }}>
      <Image
        source={art.src}
        style={{ position: 'absolute', left: -art.x * s, top: -art.y * s, width: art.w * s, height: art.h * s }}
        contentFit="fill"
      />
    </View>
  );
};

// "Come back soon" state of an arena button. A solid cream pill at full
// opacity (never a see-through, broken-looking button): the button's name, then
// a clock and the time left in navy. The ready state is the full-colour art.
const RestingButton = ({ label, line, icon = 'timer', style, big }: {
  label: string;
  line: string;
  icon?: 'timer' | 'swords' | 'check' | 'pin';
  style: any;
  big?: boolean;
}) => (
  <View style={[style, styles.restingBtn]} accessible accessibilityLabel={`${label}, ${line}`}>
    <Text style={[styles.restingLabel, big && styles.restingLabelBig]} numberOfLines={1}>{label}</Text>
    <View style={styles.restingRow}>
      <GameIcon name={icon} size={big ? 22 : 16} />
      <Text style={[styles.restingTime, big && styles.restingTimeBig]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{line}</Text>
    </View>
  </View>
);

// Sparkle component
const Sparkle = ({ x, y, delay }: { x: number; y: number; delay: number }) => {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0)).current;
  const rotation = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      opacity.setValue(0);
      scale.setValue(0);
      rotation.setValue(0);

      Animated.parallel([
        Animated.sequence([
          Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
          Animated.delay(300),
          Animated.timing(opacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.spring(scale, { toValue: 1, friction: 3, useNativeDriver: true }),
          Animated.timing(scale, { toValue: 0, duration: 400, useNativeDriver: true }),
        ]),
        Animated.timing(rotation, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]).start(() => setTimeout(animate, Math.random() * 3000));
    };

    const timeout = setTimeout(animate, delay);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={[
        styles.sparkle,
        {
          left: x,
          top: y,
          opacity,
          transform: [
            { scale },
            { rotate: rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] }) },
          ],
        },
      ]}
    >
      <GameIcon name="sparkle" size={18} />
    </Animated.View>
  );
};

interface Props {
  navigation?: any;
  route?: { params?: { parkId: number; coinUrl?: string } };
}

export default function GymBattleScreen({ navigation, route }: Props) {
  const parkId = route?.params?.parkId ?? 0;
  const coinUrl = route?.params?.coinUrl;
  
  const [gymData, setGymData] = useState<GymData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTapGame, setShowTapGame] = useState(false);
  const [showSwordAttack, setShowSwordAttack] = useState(false);
  const [showPlaceCoin, setShowPlaceCoin] = useState(false);
  const [showDefend, setShowDefend] = useState(false);
  const [pillarToast, setPillarToast] = useState<string | null>(null);
  // One toast at a time: a new one restarts the 2 s clock (an older timer
  // used to clear a newer toast early).
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = useCallback((message: string) => {
    setPillarToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setPillarToast(null), 2000);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  const [countdown, setCountdown] = useState<string>('--:--:--');
  const [attackCooldown, setAttackCooldown] = useState<number>(0);
  const [checkinCooldown, setCheckinCooldown] = useState<number>(0);
  const [defendCooldown, setDefendCooldown] = useState<number>(0);

  // The server refuses every arena action outside this park. Once the app
  // knows the kid is somewhere else, the buttons say GET CLOSER instead of
  // READY (a 25 s Defend round outside the park used to end in OOPS).
  // While the park check is still running, the buttons stay as they are.
  const { park: currentPark, parkLoaded, parkLookupRecord } = useContext(LocationStatusContext);
  const awayFromArena = Boolean(parkLoaded && parkId > 0 &&
    (currentPark ? currentPark.id !== parkId : parkLookupRecord?.outcome === 'outside'));

  // Ready buttons bob a little (native driver), only when ambient motion is
  // allowed (not with Reduce Motion, Battery Saver or an idle phone).
  const { ambient, particleScale } = usePowerBudget();
  const readyBob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ambient) { readyBob.setValue(0); return; }
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(readyBob, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(readyBob, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]));
    loop.start();
    return () => { loop.stop(); readyBob.setValue(0); };
  }, [ambient, readyBob]);
  const readyBobStyle = { transform: [{ translateY: readyBob.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] };
  
  const screenOpacity = useRef(new Animated.Value(0)).current;
  const screenScale = useRef(new Animated.Value(1.1)).current;

  // Countdown synced from API battle_status, ticks locally every second
  const battleActive = gymData?.battle_status?.is_active ?? false;
  const [battleSeconds, setBattleSeconds] = useState<number | null>(null);
  
  useEffect(() => {
    if (gymData?.battle_status?.seconds_until_next_event != null) {
      setBattleSeconds(gymData.battle_status.seconds_until_next_event);
    }
  }, [gymData?.battle_status?.seconds_until_next_event]);

  useEffect(() => {
    const formatTime = (totalSecs: number | null) => {
      if (totalSecs == null) return '--:--:--';
      if (totalSecs <= 0) return '0:00:00';
      const h = Math.floor(totalSecs / 3600);
      const m = Math.floor((totalSecs % 3600) / 60);
      const s = totalSecs % 60;
      return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };
    
    setCountdown(formatTime(battleSeconds));
    if (battleSeconds == null) return;
    const interval = setInterval(() => {
      setBattleSeconds(prev => {
        if (prev == null) return null;
        const next = Math.max(0, prev - 1);
        setCountdown(formatTime(next));
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [battleSeconds]);

  // Attack cooldown timer - use gymData.player since player isn't in scope yet
  useEffect(() => {
    const secs = gymData?.player?.seconds_until_attack;
    if (secs && secs > 0) {
      setAttackCooldown(secs);
    } else {
      setAttackCooldown(0);
    }
  }, [gymData?.player?.seconds_until_attack]);

  // Checkin cooldown timer
  useEffect(() => {
    const secs = gymData?.player?.seconds_until_checkin;
    if (secs && secs > 0) {
      setCheckinCooldown(secs);
    } else {
      setCheckinCooldown(0);
    }
  }, [gymData?.player?.seconds_until_checkin]);

  // Defend cooldown timer
  useEffect(() => {
    const secs = gymData?.player?.seconds_until_defend;
    if (secs && secs > 0) {
      setDefendCooldown(secs);
    } else {
      setDefendCooldown(0);
    }
  }, [gymData?.player?.seconds_until_defend]);

  const playButtonSound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../../../assets/sounds/button_press.mp3'),
        { volume: 0.5 }
      );
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {}
  };

  const playEntrySound = async () => {
    try {
      const { sound } = await Audio.Sound.createAsync(
        require('../../../assets/sounds/reveal.mp3'),
        { volume: 0.6 }
      );
      await sound.playAsync();
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) sound.unloadAsync();
      });
    } catch (e) {}
  };

  // Reconnect with backoff when the park can't be reached; the arena keeps its last real scores.
  const fetchGymRef = useRef<() => void>(() => undefined);
  const gymLink = useMatchLink(() => fetchGymRef.current(), parkId);
  const [loadError, setLoadError] = useState(false);
  const fetchGym = useCallback(async () => {
    try {
      const data = await getGym(parkId);
      // Ensure scores always has values
      if (data && !data.scores) {
        data.scores = { mouse: 0, globe: 0, shark: 0 };
      }
      gymLink.ok();
      setLoadError(false);
      setGymData(data);
    } catch (error) {
      // Never swap in a fake empty arena: with no player it read as "Join a Team!"
      // and zeroed every score whenever the connection dropped.
      if (isLinkFailure(error)) gymLink.fail(error);
      else { gymLink.ok(); setLoadError(true); }
    } finally {
      setLoading(false);
    }
  }, [parkId]);
  fetchGymRef.current = () => { void fetchGym(); };

  // A cooldown that ran out on this phone before the server agreed (the
  // button says ALMOST): ask again shortly, so it turns READY on its own.
  const staleWait = Boolean(gymData?.player && battleActive && !awayFromArena && (
    (checkinCooldown <= 0 && !gymData.player.can_checkin) ||
    (defendCooldown <= 0 && gymData.player.can_defend === false)));
  useEffect(() => {
    if (!staleWait) return;
    const retry = setTimeout(() => { void fetchGym(); }, 4000);
    return () => clearTimeout(retry);
  }, [staleWait, gymData, fetchGym]);

  // Countdown timers - single interval, refetch when any cooldown expires
  useEffect(() => {
    const timer = setInterval(() => {
      setAttackCooldown(prev => {
        const next = Math.max(0, prev - 1);
        if (prev > 0 && next === 0) fetchGym();
        return next;
      });
      setCheckinCooldown(prev => {
        const next = Math.max(0, prev - 1);
        if (prev > 0 && next === 0) fetchGym();
        return next;
      });
      setDefendCooldown(prev => {
        const next = Math.max(0, prev - 1);
        if (prev > 0 && next === 0) fetchGym();
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [fetchGym]);

  useEffect(() => {
    fetchGym();
    const interval = setInterval(() => { if (AppState.currentState === 'active') void fetchGym(); }, 30000);
    
    Animated.parallel([
      Animated.timing(screenOpacity, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.spring(screenScale, { toValue: 1, friction: 8, useNativeDriver: true }),
    ]).start();
    
    playEntrySound();
    
    return () => clearInterval(interval);
  }, [fetchGym]);

  // Refetch gym data when screen comes into focus (app reopen, tab switch, etc.)
  useFocusEffect(
    useCallback(() => {
      fetchGym();
    }, [fetchGym])
  );

  // Determine pillar positions based on scores
  const pillarOrder = useMemo(() => {
    const defaultOrder = ['mouse', 'globe', 'shark'] as const;
    
    // Safe access to scores with defaults
    const scores = gymData?.scores ?? { mouse: 0, globe: 0, shark: 0 };
    
    const teams = [
      { team: 'mouse' as const, score: scores.mouse ?? 0 },
      { team: 'globe' as const, score: scores.globe ?? 0 },
      { team: 'shark' as const, score: scores.shark ?? 0 },
    ];
    
    // Check if all scores are equal (including all zeros)
    const allEqual = teams.every(t => t.score === teams[0].score);
    if (allEqual) {
      // No winner yet - use default order with globe in center
      return defaultOrder;
    }
    
    // Sort by score descending - winner goes to center
    teams.sort((a, b) => b.score - a.score);
    
    // Return [left, center, right] - winner in center
    return [teams[1].team, teams[0].team, teams[2].team] as const;
  }, [gymData?.scores]);

  const winningTeam = pillarOrder[1]; // Center is the winner
  
  // Check if there's actually a winner (not all scores equal)
  const hasWinner = useMemo(() => {
    const scores = gymData?.scores ?? { mouse: 0, globe: 0, shark: 0 };
    const values = [scores.mouse ?? 0, scores.globe ?? 0, scores.shark ?? 0];
    return !values.every(v => v === values[0]);
  }, [gymData?.scores]);

  const handleDefend = () => {
    if (defendCooldown > 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playButtonSound();
    setShowDefend(true);
  };

  const handleCheckIn = async () => {
    if (!gymData?.player?.can_checkin) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playButtonSound();
    
    try {
      const result = await checkinGym(parkId);
      // Show toast with points earned
      showToast(`+${result.points_earned} points!`);
      // Refetch gym data + notify BattleHUD on ExploreScreen
      fetchGym();
      battleHUDEvents.emit();
    } catch (error) {
      console.error('Check-in failed:', error);
      showToast(friendlyActionError(error, 'Check-in failed'));
    }
  };

  const handleBattle = () => {
    if (!gymData?.player?.swords || gymData.player.swords === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    playButtonSound();
    setShowSwordAttack(true);
  };

  const handleLeaveCoin = () => {
    if (gymData?.player?.has_placed_today) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    playButtonSound();
    setShowPlaceCoin(true);
  };

  const handleGoBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    playButtonSound();
    navigation?.goBack();
  };

  // Gold specks rising off the arena floor. Capped, and none with Reduce
  // Motion, Battery Saver or an idle phone.
  const particleCount = ambient ? Math.round(14 * Math.min(1, Math.max(0, particleScale))) : 0;
  const particles = useMemo(() => {
    return Array(particleCount).fill(0).map((_, i) => ({
      id: `p-${i}`,
      x: SCREEN_W * 0.2 + Math.random() * SCREEN_W * 0.6,
      color: i % 2 === 0 ? '#FFD54A' : '#FFF1B8',
      delay: i * 400,
    }));
  }, [particleCount]);

  const sparkles = useMemo(() => 
    Array(12).fill(0).map((_, i) => ({
      id: `s-${i}`,
      x: Math.random() * SCREEN_W,
      // Start below the header cards (about 180 pt) so no star crosses their text.
      y: HEADER_BOTTOM + Math.random() * Math.max(40, SCREEN_H * 0.5 - HEADER_BOTTOM),
      delay: i * 400,
    }))
  , []);

  // No team prompt
  if (!loading && gymData && !gymData.player) {
    return (
      <Animated.View style={[styles.container, { opacity: screenOpacity, transform: [{ scale: screenScale }] }]}>
        <ImageBackground source={require('../../../assets/images/arena-bg.jpg')} style={styles.bgImage} resizeMode="cover">
          {particles.map((p) => <FloatingParticle key={p.id} delay={p.delay} startX={p.x} color={p.color} />)}
          {sparkles.map((s) => <Sparkle key={s.id} x={s.x} y={s.y} delay={s.delay} />)}
          
          {/* Show pillars anyway, in their own layer under the prompt, so
              "Join a Team!" and its button are never covered and always
              tappable. collapsable={false} keeps the layer: a flattened
              wrapper would hand the towers' zIndex back to this level. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="box-none" collapsable={false}>
            {pillarOrder.map((team, idx) => (
              <AnimatedPillar
                key={team}
                team={team}
                isWinner={hasWinner && idx === 1}
                position={idx === 0 ? 'left' : idx === 1 ? 'center' : 'right'}
                score={gymData?.scores?.[team] ?? 0}
                onTap={(t) => {
                  const teamName = TEAM_NAMES[t as keyof typeof TEAM_NAMES];
                  const pts = gymData?.scores?.[t as keyof typeof gymData.scores] ?? 0;
                  showToast(`${teamName}: ${pts.toLocaleString()} pts`);
                }}
              />
            ))}
          </View>

          <View style={styles.noTeamOverlay}>
            <BlurView intensity={30} style={styles.noTeamBlur}>
              <View style={styles.noTeamBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}><GameIcon name="swords" size={26} /><Text style={styles.noTeamTitle}>Join a Team!</Text></View>
                <Text style={styles.noTeamText}>Pick a team to enter the arena battle.</Text>
                <TouchableOpacity
                  style={[styles.pickTeamButton, styles.pickTeamGradient]}
                  onPress={() => { playButtonSound(); navigation?.navigate('TeamSelection'); }}
                >
                  <Text style={styles.pickTeamText}>PICK YOUR TEAM</Text>
                </TouchableOpacity>
              </View>
            </BlurView>
          </View>
          
          <TouchableOpacity style={styles.backButtonAbsolute} onPress={handleGoBack}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}><GameIcon name="back" size={20} /><Text style={styles.backButtonText}>BACK</Text></View>
          </TouchableOpacity>
        </ImageBackground>
      </Animated.View>
    );
  }

  // Loading, reconnecting, lost or unavailable: there is always a way back out.
  if (!gymData) {
    const title = loadError && gymLink.phase === 'live' && !loading ? 'Arena Did Not Load' : 'Loading Arena...';
    return (
      <Animated.View style={[styles.container, { opacity: screenOpacity, transform: [{ scale: screenScale }] }]}>
        <ImageBackground source={require('../../../assets/images/arena-bg.jpg')} style={styles.bgImage} resizeMode="cover">
          <View style={styles.loadingOverlay}>
            <Text style={styles.loadingText}>{title}</Text>
            <View style={styles.linkSlot}>
              <MatchLinkBanner phase={gymLink.phase} onRetry={gymLink.retryNow} onLeave={handleGoBack} leaveLabel="Leave arena" />
            </View>
            {gymLink.phase !== 'lost' && <TouchableOpacity style={styles.goBackBtn} onPress={handleGoBack} accessibilityRole="button">
              <Text style={styles.goBackText}>GO BACK</Text>
            </TouchableOpacity>}
          </View>
        </ImageBackground>
      </Animated.View>
    );
  }

  const { player } = gymData;
  const canCheckIn = player?.can_checkin ?? false;
  const hasSwords = (player?.swords ?? 0) >= 2; // Need 2 swords to attack
  const canAttack = player?.can_attack ?? false;
  const secondsUntilAttack = player?.seconds_until_attack ?? 0;
  const hasPlacedToday = player?.has_placed_today ?? false;
  // Ready only when the server would say yes: battle open, no cooldown, and
  // the kid is in this park (the server refuses every arena action outside it).
  const defendReady = battleActive && !awayFromArena && defendCooldown <= 0 && (player?.can_defend ?? true);
  const checkinReady = battleActive && !awayFromArena && canCheckIn;
  const battleReady = battleActive && !awayFromArena && canAttack;
  // What a waiting button says: what the kid needs, or when it comes back.
  const waitLine = (cooldown: number) =>
    !battleActive ? 'SOON' : awayFromArena ? 'GET CLOSER' : cooldown > 0 ? clock(cooldown) : 'ALMOST';
  const waitIcon: 'timer' | 'pin' = battleActive && awayFromArena ? 'pin' : 'timer';

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity, transform: [{ scale: screenScale }] }]}>
      <ImageBackground source={require('../../../assets/images/arena-bg.jpg')} style={styles.bgImage} resizeMode="cover">
        
        {/* Floating particles */}
        {particles.map((p) => <FloatingParticle key={p.id} delay={p.delay} startX={p.x} color={p.color} />)}
        
        {/* Sparkles */}
        {sparkles.map((s) => <Sparkle key={s.id} x={s.x} y={s.y} delay={s.delay} />)}

        {/* Connection: "Reconnecting..." or a free way out once the park can't be reached */}
        {gymLink.phase !== 'live' && <View style={styles.linkOverlay} pointerEvents="box-none">
          <MatchLinkBanner phase={gymLink.phase} onRetry={gymLink.retryNow} onLeave={handleGoBack} leaveLabel="Leave arena" />
        </View>}

        {/* Arena Header */}
        <View style={styles.arenaHeader}>
          {/* Title */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: pillarToast ? 0 : 1 }}><GameIcon name="swords" size={30} /><Text style={styles.arenaTitle}>ARENA BATTLE</Text><GameIcon name="swords" size={30} /></View>
          
          {/* Stats Row */}
          <View style={styles.statsRow}>
            {/* Your Team */}
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>YOUR TEAM</Text>
              <View style={styles.statTeamRow}>
                {player?.team && TEAMS[player.team as TeamId] ? (
                  <Image source={TEAMS[player.team as TeamId].badge} style={styles.statCrest} contentFit="contain" />
                ) : null}
                <Text style={[styles.statValue, { color: TEAM_COLORS[player?.team as keyof typeof TEAM_COLORS] || '#123A6B' }]}>
                  {player?.team ? TEAM_NAMES[player.team as keyof typeof TEAM_NAMES]?.replace('Team ', '') : 'None'}
                </Text>
              </View>
            </View>
            
            {/* Countdown */}
            <View style={[styles.statBox, styles.countdownBox]}>
              <Text style={styles.statLabel}>
                {gymData?.battle_status?.next_event === 'starts' ? 'STARTS IN' : 'RESETS IN'}
              </Text>
              <Text style={styles.countdownText}>{countdown}</Text>
            </View>
            
            {/* Leader */}
            <View style={styles.statBox}>
              <Text style={styles.statLabel}>LEADING</Text>
              <View style={styles.statTeamRow}>
                {hasWinner ? (
                  <Image source={TEAMS[winningTeam].badge} style={styles.statCrest} contentFit="contain" />
                ) : null}
                <Text style={[styles.statValue, { color: hasWinner ? TEAM_COLORS[winningTeam] : '#123A6B' }]}>
                  {hasWinner ? TEAM_NAMES[winningTeam]?.replace('Team ', '') : 'TIE'}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Dynamic Pillars - winner in center */}
        {pillarOrder.map((team, idx) => (
          <AnimatedPillar
            key={team}
            team={team}
            isWinner={hasWinner && idx === 1}
            position={idx === 0 ? 'left' : idx === 1 ? 'center' : 'right'}
            score={gymData.scores?.[team] ?? 0}
            onTap={(t) => {
              const teamName = TEAM_NAMES[t as keyof typeof TEAM_NAMES];
              const pts = gymData.scores?.[t as keyof typeof gymData.scores] ?? 0;
              showToast(`${teamName}: ${pts.toLocaleString()} pts`);
            }}
          />
        ))}

        {/* Bottom gradient */}
        <View
          style={styles.bottomGradient}
          pointerEvents="none"
        />

        {/* Action Buttons */}
        <View style={styles.actionsContainer}>
          {/* Top row: Defend, Check In, Battle. Ready = READY tag + the
              full-colour button at the full ready height, bobbing gently.
              Waiting = a smaller solid cream pill with a clock (or what the
              kid needs: GET CLOSER with a pin, NEED 2 swords). */}
          <View style={styles.actionRow}>
            {/* Defend button - 30 min cooldown */}
            <View style={styles.actionCell}>
              {defendReady ? (
                <Animated.View style={[styles.readyStack, readyBobStyle]}>
                  <View style={styles.readyBadge}>
                    <Text style={styles.readyText}>READY</Text>
                  </View>
                  <AnimatedButton onPress={handleDefend} noShimmer>
                    <ReadyArt name="defend" />
                  </AnimatedButton>
                </Animated.View>
              ) : (
                <>
                  <View style={styles.badgeSpacer} />
                  <View style={styles.readySlot}>
                    <RestingButton
                      label="DEFEND"
                      line={waitLine(defendCooldown)}
                      icon={waitIcon}
                      style={styles.waitPill}
                    />
                  </View>
                </>
              )}
            </View>

            {/* Check In button */}
            <View style={styles.actionCell}>
              {checkinReady ? (
                <Animated.View style={[styles.readyStack, readyBobStyle]}>
                  <View style={styles.readyBadge}>
                    <Text style={styles.readyText}>READY</Text>
                  </View>
                  <AnimatedButton onPress={handleCheckIn} noShimmer>
                    <ReadyArt name="checkin" />
                  </AnimatedButton>
                </Animated.View>
              ) : (
                <>
                  <View style={styles.badgeSpacer} />
                  <View style={styles.readySlot}>
                    <RestingButton
                      label="CHECK IN"
                      line={waitLine(checkinCooldown)}
                      icon={waitIcon}
                      style={styles.waitPill}
                    />
                  </View>
                </>
              )}
            </View>

            {/* Battle button */}
            <View style={styles.actionCell}>
              {battleReady ? (
                <Animated.View style={[styles.readyStack, readyBobStyle]}>
                  <View style={styles.readyBadge}>
                    <Text style={styles.readyText}>READY</Text>
                  </View>
                  <AnimatedButton onPress={handleBattle} noShimmer>
                    <ReadyArt name="battle" />
                  </AnimatedButton>
                </Animated.View>
              ) : (
                <>
                  <View style={styles.badgeSpacer} />
                  <View style={styles.readySlot}>
                    {battleActive && !awayFromArena && attackCooldown <= 0 && !hasSwords ? (
                      <RestingButton label="BATTLE" line="NEED 2" icon="swords" style={styles.waitPill} />
                    ) : (
                      <RestingButton
                        label="BATTLE"
                        line={waitLine(attackCooldown)}
                        icon={waitIcon}
                        style={styles.waitPill}
                      />
                    )}
                  </View>
                </>
              )}
            </View>
          </View>

          {/* Leave a Coin: the gold art when it can be used, otherwise a solid
              cream "done for today", "get closer" or "soon" pill in the same spot. */}
          {battleActive && !hasPlacedToday && !awayFromArena ? (
            <AnimatedButton
              onPress={handleLeaveCoin}
              source={require('../../../assets/images/btn-leavecoin.png')}
              style={styles.leaveCoinBtnImage}
              noShimmer
            />
          ) : (
            <View style={[styles.leaveCoinBtnImage, styles.leaveCoinRestSlot]}>
              <RestingButton
                label="LEAVE A COIN"
                line={hasPlacedToday ? 'DONE TODAY' : battleActive && awayFromArena ? 'GET CLOSER' : 'SOON'}
                icon={hasPlacedToday ? 'check' : battleActive && awayFromArena ? 'pin' : 'timer'}
                style={styles.leaveCoinRest}
                big
              />
            </View>
          )}

          {/* Go Back button */}
          <AnimatedButton 
            onPress={handleGoBack}
            source={require('../../../assets/images/btn-goback.png')}
            style={styles.goBackBtnImage}
            noShimmer
          />
        </View>

        {/* Pillar Toast */}
        {pillarToast && (
          <Reanimated.View key={pillarToast} entering={ZoomIn.duration(180)} exiting={FadeOut.duration(150)} style={styles.pillarToastSlot} pointerEvents="none">
            <View style={styles.pillarToast}>
              <Text style={styles.pillarToastText} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8}>{pillarToast}</Text>
            </View>
          </Reanimated.View>
        )}

        {/* Modals */}
        <TapMiniGameModal
          visible={showTapGame}
          parkId={parkId}
          isUnderdog={player?.is_underdog ?? false}
          onComplete={() => { setShowTapGame(false); fetchGym(); }}
          onClose={() => setShowTapGame(false)}
        />

        <SwordAttackModal
          visible={showSwordAttack}
          parkId={parkId}
          playerTeam={player?.team ?? 'shark'}
          scores={gymData.scores}
          onComplete={() => { setShowSwordAttack(false); fetchGym(); }}
          onClose={() => setShowSwordAttack(false)}
        />

        <PlaceCoinModal
          visible={showPlaceCoin}
          parkId={parkId}
          onComplete={() => { setShowPlaceCoin(false); fetchGym(); }}
          onClose={() => setShowPlaceCoin(false)}
        />

        <DefendMiniGameModal
          visible={showDefend}
          parkId={parkId}
          onComplete={() => { setShowDefend(false); fetchGym(); }}
          onClose={() => setShowDefend(false)}
        />
      </ImageBackground>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0768b9',
  },
  bgImage: {
    flex: 1,
  },
  pillarContainer: {
    position: 'absolute',
    alignItems: 'center',
  },
  // Winner cue in Alex's flat style: a hard team-colour stage behind the
  // tower base with a navy outline, peeking out around the base. No soft glow
  // (Dustin asked to drop the glow-filter look). The render passes
  // shadowColor; shadowOpacity 0 keeps it from drawing anything soft.
  pillarStageWrap: {
    position: 'absolute',
    bottom: '1%',
    left: '6%',
    right: '6%',
    height: '9%',
  },
  pillarGlow: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#123A6B',
    shadowOpacity: 0,
    shadowRadius: 0,
  },
  pillarImage: {
    width: '100%',
    height: '100%',
  },
  winnerCrown: {
    position: 'absolute',
    top: -30,
  },
  scoreBadge: {
    position: 'absolute',
    top: -25,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingLeft: 4,
    paddingRight: 12,
    paddingVertical: 3,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: '#123A6B',
    // Flat navy drop, no blur (Alex style).
    shadowColor: '#123A6B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  scoreCrest: {
    width: 26,
    height: 26,
  },
  scoreText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '900',
    fontFamily: 'Shark',
    textShadowColor: '#123A6B',
    textShadowOffset: { width: 1, height: 1.5 },
    textShadowRadius: 0,
  },
  // Small solid gold specks that match the sparkles (an outlined dot read
  // as a grey bubble or dirt on the light floor).
  particle: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  sparkle: {
    position: 'absolute',
    fontSize: 20,
    color: '#FFD700',
  },
  bottomGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 250,
    backgroundColor: 'rgba(5, 52, 110, 0.5)',
  },
  actionsContainer: {
    position: 'absolute',
    bottom: 25,
    left: 16,
    right: 16,
    gap: 6,
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    width: '100%',
  },
  imageBtn: {
    // Container for image buttons
  },
  leaveCoinBtnImage: {
    // Leave a coin: 788x262 = 3:1 aspect ratio
    width: SCREEN_W - 48,
    height: (SCREEN_W - 48) / 3,
  },
  goBackBtnImage: {
    // Go back: smaller and moved up
    width: SCREEN_W * 0.5,
    height: (SCREEN_W * 0.5) / 2.75,
    alignSelf: 'center',
  },
  btnDisabled: {
    opacity: 0.4,
  },
  // Same solid cream pill as the header cards (no see-through navy).
  // It takes the ARENA BATTLE title's place for 2 s, so on every phone size
  // it covers no tower and no button (on an SE there is no free floor band).
  pillarToastSlot: {
    position: 'absolute',
    top: 47,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 30,
  },
  pillarToast: {
    maxWidth: '100%',
    backgroundColor: '#FFF8E6',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 2.5,
    borderColor: '#123A6B',
    shadowColor: '#123A6B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  pillarToastText: {
    textAlign: 'center',
    color: '#123A6B',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Shark',
  },
  actionCell: {
    width: ACTION_CELL_W,
    alignItems: 'center',
  },
  readyStack: {
    alignItems: 'center',
  },
  // Both states share one slot at the ready height, so the row never jumps
  // and a smaller waiting pill sits centred where the ready art would be.
  readySlot: {
    height: READY_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waitPill: {
    width: WAIT_W,
    height: WAIT_H,
  },
  // Solid green READY tag with the navy outline (go). Same height as the
  // spacer a waiting button keeps, so the row never jumps.
  readyBadge: {
    height: 24,
    justifyContent: 'center',
    backgroundColor: '#22C55E',
    paddingHorizontal: 10,
    borderRadius: 12,
    marginBottom: 4,
    borderWidth: 2,
    borderColor: '#123A6B',
  },
  readyText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
    fontFamily: 'Shark',
    textShadowColor: '#123A6B',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 0,
  },
  badgeSpacer: {
    height: 24,
    marginBottom: 4,
  },
  // Waiting (come back soon): a solid, quieter cream pill at full opacity.
  restingBtn: {
    backgroundColor: '#EFE6D2',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: '#123A6B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#123A6B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  restingLabel: {
    color: '#5A6F8C',
    fontSize: 10,
    lineHeight: 12,
    fontWeight: '800',
    fontFamily: 'Shark',
    letterSpacing: 0.5,
  },
  restingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
    paddingHorizontal: 8,
  },
  restingTime: {
    flexShrink: 1,
    color: '#123A6B',
    fontSize: 14,
    lineHeight: 17,
    fontWeight: '900',
    fontFamily: 'Shark',
  },
  restingLabelBig: { fontSize: 14, lineHeight: 17 },
  restingTimeBig: { fontSize: 20, lineHeight: 24 },
  leaveCoinRestSlot: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  leaveCoinRest: {
    width: '78%',
    height: '56%',
  },
  arenaHeader: {
    position: 'absolute',
    top: 50,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  arenaTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#FBBF24',
    fontFamily: 'Shark',
    textShadowColor: '#123A6B',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
    marginBottom: 12,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 12,
  },
  // Same bright cream card as Join a Team and Defend: solid fill (nothing
  // shows through), 3 pt navy outline and a hard navy drop.
  statBox: {
    flex: 1,
    backgroundColor: '#FFF8E6',
    borderRadius: 14,
    paddingVertical: 5,
    paddingHorizontal: 6,
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#123A6B',
    shadowColor: '#123A6B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
  },
  // The timer card is the gold one, so the middle reads as "the clock".
  countdownBox: {
    backgroundColor: '#FFD54A',
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#123A6B',
    letterSpacing: 1,
    marginBottom: 3,
  },
  statTeamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  // Big enough at 375 pt for a non-reader to match it to the tower crest.
  statCrest: {
    width: 28,
    height: 28,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '900',
    fontFamily: 'Shark',
    textShadowColor: '#123A6B',
    textShadowOffset: { width: 1, height: 1.5 },
    textShadowRadius: 0,
  },
  countdownText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#123A6B',
    fontFamily: 'Shark',
    letterSpacing: 1,
  },
  linkSlot: { alignSelf: 'stretch', paddingHorizontal: 24 },
  linkOverlay: { position: 'absolute', left: 16, right: 16, bottom: 150, zIndex: 50 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(5, 52, 110, 0.4)',
  },
  loadingText: {
    color: '#FBBF24',
    fontSize: 24,
    fontWeight: '800',
    textShadowColor: '#123A6B',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 0,
  },
  goBackBtn: {
    marginTop: 24,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
    backgroundColor: 'rgba(5, 70, 143, 0.9)',
  },
  goBackText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
  noTeamOverlay: {
    ...StyleSheet.absoluteFillObject,
    // Sits on the arena floor just above BACK, so the towers stay in view
    // on tall phones and only their bases tuck behind it on an SE.
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: 104,
  },
  // Same cream card language as Defend: navy outline, flat drop, bright.
  noTeamBlur: {
    alignSelf: 'stretch',
    borderRadius: 28,
    overflow: 'hidden',
    marginHorizontal: 20,
    borderWidth: 3,
    borderColor: '#123A6B',
  },
  noTeamBox: {
    backgroundColor: '#FFF8E6',
    paddingHorizontal: 24,
    paddingVertical: 24,
    alignItems: 'center',
  },
  noTeamTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: '#0768B9',
    textShadowColor: '#FFD700',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 0,
    marginBottom: 10,
  },
  noTeamText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#123A6B',
    textAlign: 'center',
    marginBottom: 22,
  },
  pickTeamButton: {
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#123A6B',
  },
  pickTeamGradient: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    backgroundColor: '#FFD700',
  },
  pickTeamText: {
    color: '#05346e',
    fontWeight: '900',
    fontSize: 18,
  },
  backButtonAbsolute: {
    position: 'absolute',
    bottom: 40,
    left: 20,
    right: 20,
    backgroundColor: '#0768B9',
    paddingVertical: 14,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#123A6B',
    alignItems: 'center',
  },
  backButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '700',
  },
});
