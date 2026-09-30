import GameIcon from '../ui/GameIcon';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, useCallback, useContext } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { claimStampReward, equipStampTitle, getStamps, StampData as ApiStampData, StampRewards } from '../api/endpoints/me/stamps';
import { AuthContext } from '../context/AuthProvider';

// ── Assets ──────────────────────────────────────────────
const BOOK_BG = require('../../assets/images/stampbook-bg.png');
const STAMP_LOGO = require('../../assets/images/stamps/stamp-logo.png');
const STAMP_01 = require('../../assets/images/stamps/stamp-01.png');
const STAMP_02 = require('../../assets/images/stamps/stamp-02.png');
const STAMP_03 = require('../../assets/images/stamps/stamp-03.png');
const STAMP_04 = require('../../assets/images/stamps/stamp-04.png');
const STAMP_05 = require('../../assets/images/stamps/stamp-05.png');
const STAMP_06 = require('../../assets/images/stamps/stamp-06.png');
const STAMP_07 = require('../../assets/images/stamps/stamp-07.png');
const STAMP_08 = require('../../assets/images/stamps/stamp-08.png');
const STAMP_09 = require('../../assets/images/stamps/stamp-09.png');
const FIRST_RIDE_COIN_STAMP = require('../../assets/images/stamps/first-ride-coin-v1.png');
const RIDE_PASSPORT_STAMP = require('../../assets/images/stamps/ride-passport-complete-v1.png');

const { width: SW } = Dimensions.get('window');
const CARD_SIZE = (SW - 48) / 3; // 3 columns with gaps

// ── Colors ──────────────────────────────────────────────
const GOLD = '#C5933A';
const INK = '#3E2712';
const STAMP_EARNED_COLOR = '#4CAF50';
const STAMP_LOCKED_COLOR = '#C4B69C';

const RARITY_COLORS: Record<string, string> = {
  common: '#78909C',
  uncommon: '#4CAF50',
  rare: '#2196F3',
  epic: '#E0A100',
  legendary: '#FF9800',
};

// ── Image key mapping ───────────────────────────────────
const IMAGE_KEY_MAP: Record<string, number> = {
  'stamp-01': STAMP_01,
  'stamp-02': STAMP_02,
  'stamp-03': STAMP_03,
  'stamp-04': STAMP_04,
  'stamp-05': STAMP_05,
  'stamp-06': STAMP_06,
  'stamp-07': STAMP_07,
  'stamp-08': STAMP_08,
  'stamp-09': STAMP_09,
  'first-ride-coin-v1': FIRST_RIDE_COIN_STAMP,
  'ride-passport-complete-v1': RIDE_PASSPORT_STAMP,
};

// ── Stamp data ──────────────────────────────────────────
interface StampData {
  id: number;
  name: string;
  goal: string;
  image?: number;
  earned: boolean;
  progress?: number;
  progressText?: string;
  rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';
  rewardClaimed: boolean;
  rewards: StampRewards;
}

function apiToLocal(s: ApiStampData): StampData {
  return {
    id: s.id,
    name: s.name,
    goal: s.goal,
    image: s.slug === 'first-ride-coin'
      ? FIRST_RIDE_COIN_STAMP : s.image_key ? IMAGE_KEY_MAP[s.image_key] : undefined,
    earned: s.is_earned,
    progress: s.progress_percentage,
    progressText: s.progress_text,
    rarity: s.rarity,
    rewardClaimed: s.reward_claimed,
    rewards: s.rewards,
  };
}

function flattenStamps(groups: Record<string, ApiStampData[]>): StampData[] {
  return Object.values(groups).flatMap((group) => group.map(apiToLocal));
}

const QUEUE_STAMP_PREVIEW: StampData[] = [
  { id: -1, name: 'First Park Coin', goal: 'Collect your first park coin',
    image: STAMP_01, earned: true, progress: 100, progressText: '1/1', rarity: 'common',
    rewardClaimed: true, rewards: { energy: 10, tickets: 0, xp: 50, coins: 0, title: null } },
  { id: -2, name: 'Queue Navigator', goal: 'Complete 10 verified minutes of LinePlay in one ride session',
    image: STAMP_09, earned: true, progress: 100, progressText: '1/1', rarity: 'uncommon',
    rewardClaimed: false, rewards: { energy: 20, tickets: 0, xp: 75, coins: 0, title: 'Queue Navigator' } },
  { id: -3, name: 'Park Coin Artisan', goal: 'Upgrade a collected park coin',
    image: STAMP_03, earned: false, progress: 0, progressText: '0/1', rarity: 'uncommon',
    rewardClaimed: false, rewards: { energy: 25, tickets: 0, xp: 100, coins: 0, title: null } },
];

function rewardText(rewards: StampRewards): string {
  return [
    rewards.energy > 0 && `+${rewards.energy} Energy`,
    rewards.tickets > 0 && `+${rewards.tickets} Ticket${rewards.tickets === 1 ? '' : 's'}`,
    rewards.xp > 0 && `+${rewards.xp} XP`,
    rewards.coins > 0 && `+${rewards.coins} Coins`,
    rewards.title && `“${rewards.title}” title`,
  ].filter(Boolean).join('  ·  ');
}

// ── Stamp Card ──────────────────────────────────────────
function StampCard({ stamp, index, onPress }: { stamp: StampData; index: number; onPress: () => void }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const pressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 300, delay: index * 40, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 120, delay: index * 40, useNativeDriver: true }),
    ]).start();
  }, []);

  const handlePressIn = () => {
    Animated.spring(pressScale, { toValue: 0.92, friction: 8, useNativeDriver: true }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressScale, { toValue: 1, friction: 4, tension: 300, useNativeDriver: true }).start();
  };

  const rarityColor = RARITY_COLORS[stamp.rarity];

  return (
    <Animated.View style={[cardStyles.wrapper, { opacity: fadeAnim, transform: [{ scale: Animated.multiply(scaleAnim, pressScale) }] }]}>
      <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut} onPress={onPress}>
        <View style={[cardStyles.card, { borderColor: stamp.earned ? rarityColor : '#e6d6b3' }]}>
          {/* Rarity stripe */}
          <View style={[cardStyles.stripe, { backgroundColor: stamp.earned ? rarityColor : STAMP_LOCKED_COLOR }]} />

          {/* Image */}
          <View style={cardStyles.imageWrap}>
            <Image source={stamp.image || STAMP_01} style={cardStyles.stampImage} contentFit="contain" />
            {!stamp.earned && <View style={cardStyles.lockedOverlay} />}
          </View>

          {/* Name */}
          <Text style={[cardStyles.name, !stamp.earned && { color: '#7a6446' }]} numberOfLines={1}>
            {stamp.name}
          </Text>

          {/* Goal */}
          <Text style={cardStyles.goal} numberOfLines={2}>{stamp.goal}</Text>

          {/* Progress bar */}
          {stamp.progress !== undefined && (
            <View style={cardStyles.progressWrap}>
              <View style={cardStyles.progressBg}>
                <View style={[cardStyles.progressFill, { width: `${stamp.progress}%`, backgroundColor: rarityColor }]} />
              </View>
              {stamp.progressText && <Text style={cardStyles.progressText}>{stamp.progressText}</Text>}
            </View>
          )}

          {/* Badge */}
          {stamp.earned ? (
            <View style={[cardStyles.badge, { backgroundColor: STAMP_EARNED_COLOR }]}>
              <GameIcon name="check" size={8 + 4} />
            </View>
          ) : (
            <View style={[cardStyles.badge, { backgroundColor: '#9c8a6a' }]}>
              <GameIcon name="lock" size={8 + 4} />
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Main Screen ─────────────────────────────────────────
export default function StampBookScreen() {
  const previewMode = __DEV__ && process.env.EXPO_PUBLIC_STAMP_BOOK_PREVIEW === '1';
  const { player, refreshPlayer } = useContext(AuthContext);
  const [stamps, setStamps] = useState<StampData[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selectedStamp, setSelectedStamp] = useState<StampData | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [claiming, setClaiming] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  const handleClaim = useCallback(async () => {
    if (previewMode) return;
    if (!selectedStamp || claiming || !selectedStamp.earned || selectedStamp.rewardClaimed) return;
    const stampId = selectedStamp.id;
    setClaiming(true);
    setClaimMessage(null);
    try {
      await claimStampReward(stampId);
      setSelectedStamp((current) => current?.id === stampId ? { ...current, rewardClaimed: true } : current);
      setStamps((current) => current.map((stamp) => stamp.id === stampId
        ? { ...stamp, rewardClaimed: true } : stamp));
      setClaimMessage('Stamp rewards claimed.');
      try {
        await refreshPlayer();
      } catch {
        setClaimMessage('Rewards claimed. Your profile will refresh when you reconnect.');
      }
    } catch {
      // A lost response can follow a successful claim. Read back before showing failure.
      try {
        const response = await getStamps();
        const fresh = flattenStamps(response.stamps);
        const confirmed = fresh.find((stamp) => stamp.id === stampId);
        setStamps(fresh);
        if (confirmed) setSelectedStamp(confirmed);
        if (confirmed?.rewardClaimed) {
          setClaimMessage('Rewards claimed.');
          await refreshPlayer().catch(() => undefined);
        } else {
          setClaimMessage('Claim did not go through. Please try again.');
        }
      } catch {
        setClaimMessage('Claim status is uncertain. Reopen your Stamp Book to check.');
      }
    } finally {
      setClaiming(false);
    }
  }, [selectedStamp, claiming, refreshPlayer, previewMode]);

  const handleEquipTitle = useCallback(async () => {
    if (previewMode) return;
    if (!selectedStamp?.rewardClaimed || !selectedStamp.rewards.title || equipping) return;
    const desiredTitle = player?.title === selectedStamp.rewards.title
      ? null : selectedStamp.rewards.title;
    setEquipping(true);
    setClaimMessage(null);
    try {
      await equipStampTitle(desiredTitle ? selectedStamp.id : null);
      await refreshPlayer();
      setClaimMessage(desiredTitle ? 'Title is now on your profile.' : 'Title removed from your profile.');
    } catch {
      try {
        const freshPlayer = await refreshPlayer();
        setClaimMessage((freshPlayer?.title ?? null) === desiredTitle
          ? 'Profile title updated.' : 'Could not update your profile title. Please try again.');
      } catch {
        setClaimMessage('Title status is uncertain. Reopen your profile to check.');
      }
    } finally {
      setEquipping(false);
    }
  }, [selectedStamp, equipping, player?.title, refreshPlayer, previewMode]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      if (previewMode) {
        setStamps(QUEUE_STAMP_PREVIEW);
        setStatus('ready');
        return () => { active = false; };
      }
      setStatus('loading');
      setStamps([]);
      (async () => {
        try {
          const resp = await getStamps();
          const flat = flattenStamps(resp.stamps);
          if (active) {
            setStamps(flat);
            setStatus('ready');
          }
        } catch {
          if (active) setStatus('error');
        }
      })();
      return () => { active = false; };
    }, [reloadKey, previewMode])
  );

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Stamp Book</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>

      <View style={styles.bookArea}>
        {/* Book background */}
        <Image source={BOOK_BG} style={StyleSheet.absoluteFill} contentFit="cover" />
        <View style={styles.darkOverlay} />

        <ScrollView
          style={[StyleSheet.absoluteFill, { zIndex: 5 }]}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={styles.logoWrap}>
            <Image source={STAMP_LOGO} style={styles.logo} contentFit="contain" />
          </View>

          {status !== 'ready' && (
            <View style={styles.stateWrap}>
              <Text style={styles.stateText}>
                {status === 'loading' ? 'Opening your Stamp Book…' : 'Your Stamp Book could not load.'}
              </Text>
              {status === 'error' && (
                <Pressable onPress={() => setReloadKey((key) => key + 1)} style={styles.retryButton}>
                  <Text style={styles.retryText}>Try again</Text>
                </Pressable>
              )}
            </View>
          )}
          {status === 'ready' && stamps.length === 0 && (
            <Text style={styles.stateText}>No stamps are available yet.</Text>
          )}

          {/* Stamp grid */}
          <View style={styles.grid}>
            {stamps.map((stamp, i) => (
              <StampCard key={stamp.id} stamp={stamp} index={i} onPress={() => {
                setClaimMessage(null);
                setSelectedStamp(stamp);
              }} />
            ))}
          </View>

          <View style={{ height: 30 }} />
        </ScrollView>
      </View>
      {/* Stamp Detail Modal */}
      <Modal
        visible={!!selectedStamp}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedStamp(null)}
      >
        {selectedStamp && (
          <Pressable style={modalStyles.overlay} onPress={() => setSelectedStamp(null)}>
            <Pressable style={modalStyles.card} onPress={() => {}}>
              {/* Stamp image */}
              <View style={modalStyles.imageContainer}>
                <Image
                  source={selectedStamp.image || STAMP_01}
                  style={modalStyles.stampImage}
                  contentFit="contain"
                />
                {!selectedStamp.earned && <View style={modalStyles.lockedImageOverlay} />}
              </View>

              {/* Rarity badge */}
              <View style={[modalStyles.rarityBadge, { backgroundColor: RARITY_COLORS[selectedStamp.rarity] }]}>  
                <Text style={modalStyles.rarityText}>{selectedStamp.rarity.toUpperCase()}</Text>
              </View>

              {/* Name */}
              <Text style={modalStyles.name}>{selectedStamp.name}</Text>

              {/* Goal */}
              <View style={modalStyles.goalBox}>
                <Text style={modalStyles.goalLabel}>HOW TO EARN</Text>
                <Text style={modalStyles.goalText}>{selectedStamp.goal}</Text>
              </View>

              {!!rewardText(selectedStamp.rewards) && (
                <View style={modalStyles.goalBox}>
                  <Text style={modalStyles.goalLabel}>REWARDS</Text>
                  <Text style={modalStyles.goalText}>{rewardText(selectedStamp.rewards)}</Text>
                </View>
              )}

              {/* Progress */}
              {selectedStamp.progress !== undefined && (
                <View style={modalStyles.progressSection}>
                  <View style={modalStyles.progressBarBg}>
                    <View style={[modalStyles.progressBarFill, { width: `${selectedStamp.progress}%`, backgroundColor: RARITY_COLORS[selectedStamp.rarity] }]} />
                  </View>
                  <Text style={modalStyles.progressLabel}>
                    {selectedStamp.progressText || `${selectedStamp.progress}%`}
                  </Text>
                </View>
              )}

              {/* Status */}
              {selectedStamp.earned ? (
                <View style={modalStyles.earnedBox}>
                  <GameIcon name="check" size={14 + 4} />
                  <Text style={modalStyles.earnedText}>
                    {selectedStamp.rewardClaimed && rewardText(selectedStamp.rewards) ? 'Rewards claimed' : 'Earned!'}
                  </Text>
                </View>
              ) : (
                <View style={modalStyles.lockedBox}>
                  <GameIcon name="lock" size={14 + 4} />
                  <Text style={modalStyles.lockedText}>Locked</Text>
                </View>
              )}

              {selectedStamp.earned && !selectedStamp.rewardClaimed && !!rewardText(selectedStamp.rewards) && (
                <Pressable
                  style={[modalStyles.claimButton, claiming && { opacity: 0.5 }]}
                  disabled={claiming}
                  onPress={handleClaim}
                >
                  <Text style={modalStyles.claimText}>{claiming ? 'Checking…' : 'Claim rewards'}</Text>
                </Pressable>
              )}
              {selectedStamp.rewardClaimed && !!selectedStamp.rewards.title && (
                <Pressable
                  style={[modalStyles.claimButton, equipping && { opacity: 0.5 }]}
                  disabled={equipping}
                  onPress={handleEquipTitle}
                >
                  <Text style={modalStyles.claimText}>
                    {equipping ? 'Saving…' : player?.title === selectedStamp.rewards.title
                      ? 'Remove profile title' : 'Wear profile title'}
                  </Text>
                </Pressable>
              )}
              {!!claimMessage && <Text style={modalStyles.claimMessage}>{claimMessage}</Text>}

              {/* Close hint */}
              <Text style={modalStyles.closeHint}>Tap outside to close</Text>
            </Pressable>
          </Pressable>
        )}
      </Modal>

    </Wrapper>
  );
}

// ── Styles ──────────────────────────────────────────────
const styles = StyleSheet.create({
  bookArea: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  darkOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(5,52,110,0.5)',
    zIndex: 1,
    pointerEvents: 'none',
  },
  scrollContent: {
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  logoWrap: {
    alignItems: 'center',
    marginBottom: 12,
    shadowColor: '#FFD700',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 20,
    elevation: 10,
  },
  logo: {
    width: SW * 0.85,
    height: SW * 0.32,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  stateWrap: { alignItems: 'center', paddingVertical: 28 },
  stateText: { color: '#fff', fontFamily: 'Knockout', fontSize: 16, textAlign: 'center' },
  retryButton: { marginTop: 12, borderRadius: 10, backgroundColor: GOLD, paddingHorizontal: 20, paddingVertical: 10 },
  retryText: { color: INK, fontFamily: 'Knockout', fontSize: 15 },
});

const cardStyles = StyleSheet.create({
  wrapper: {
    width: CARD_SIZE,
  },
  card: {
    backgroundColor: '#fff8e4',
    borderRadius: 10,
    borderWidth: 1.5,
    alignItems: 'center',
    padding: 6,
    paddingTop: 8,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  stripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  imageWrap: {
    width: CARD_SIZE * 0.75,
    height: CARD_SIZE * 0.65,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 4,
  },
  stampImage: {
    width: '100%',
    height: '100%',
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,248,228,0.35)',
  },
  name: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: INK,
    fontWeight: '600',
    textAlign: 'center',
  },
  goal: {
    fontFamily: 'Knockout',
    fontSize: 8,
    color: '#6b5335',
    textAlign: 'center',
    lineHeight: 10,
    marginTop: 1,
    paddingHorizontal: 2,
  },
  progressWrap: {
    width: '90%',
    alignItems: 'center',
    marginTop: 3,
  },
  progressBg: {
    width: '100%',
    height: 3,
    backgroundColor: '#eadfc6',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  progressText: {
    fontFamily: 'Knockout',
    fontSize: 7,
    color: '#7a6446',
    marginTop: 1,
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ── Modal styles ────────────────────────────────────────
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(5,52,110,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#fff8e4',
    borderRadius: 20,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    padding: 24,
    shadowColor: '#05346e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 14,
    elevation: 10,
  },
  imageContainer: {
    width: 180,
    height: 160,
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 12,
  },
  stampImage: {
    width: '100%',
    height: '100%',
  },
  lockedImageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,248,228,0.3)',
  },
  rarityBadge: {
    paddingHorizontal: 14,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 10,
  },
  rarityText: {
    fontFamily: 'Knockout',
    fontSize: 11,
    color: '#fff',
    fontWeight: '700',
    letterSpacing: 1,
  },
  name: {
    fontFamily: 'Shark',
    fontSize: 24,
    color: '#05346e',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  goalBox: {
    width: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: '#f2e3bf',
  },
  goalLabel: {
    fontFamily: 'Knockout',
    fontSize: 9,
    color: '#a36609',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  goalText: {
    fontFamily: 'Knockout',
    fontSize: 15,
    color: '#05346e',
    lineHeight: 20,
  },
  progressSection: {
    width: '100%',
    marginBottom: 14,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: '#eadfc6',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabel: {
    fontFamily: 'Knockout',
    fontSize: 12,
    color: '#6b5335',
    textAlign: 'center',
  },
  earnedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#e3f5e4',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  earnedText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#2e7d32',
    fontWeight: '700',
  },
  lockedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#f3ead6',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  lockedText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: '#7a6446',
  },
  closeHint: {
    fontFamily: 'Knockout',
    fontSize: 11,
    color: '#9c8a6a',
    marginTop: 4,
  },
  claimButton: { backgroundColor: GOLD, borderRadius: 10, paddingHorizontal: 24, paddingVertical: 12, marginBottom: 10 },
  claimText: { color: INK, fontFamily: 'Knockout', fontSize: 16, textAlign: 'center' },
  claimMessage: { color: '#05346e', fontFamily: 'Knockout', fontSize: 13, textAlign: 'center', marginBottom: 10 },
});
