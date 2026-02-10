import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faLock, faCheck } from '@fortawesome/free-solid-svg-icons';
import { Image } from 'expo-image';
import { useEffect, useRef, useState, useCallback } from 'react';
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
import { getStamps, claimStampReward, StampData as ApiStampData } from '../api/endpoints/me/stamps';

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

const { width: SW } = Dimensions.get('window');
const CARD_SIZE = (SW - 48) / 3; // 3 columns with gaps

// ── Colors ──────────────────────────────────────────────
const GOLD = '#C5933A';
const GOLD_LIGHT = '#DEB155';
const INK = '#3E2712';
const INK_FAINT = '#A89278';
const STAMP_EARNED_COLOR = '#4CAF50';
const STAMP_LOCKED_COLOR = '#C4B69C';

const RARITY_COLORS: Record<string, string> = {
  common: '#78909C',
  uncommon: '#4CAF50',
  rare: '#2196F3',
  epic: '#9C27B0',
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
}

function apiToLocal(s: ApiStampData): StampData {
  return {
    id: s.id,
    name: s.name,
    goal: s.goal,
    image: s.image_key ? IMAGE_KEY_MAP[s.image_key] : undefined,
    earned: s.is_earned,
    progress: s.progress_percentage,
    progressText: s.progress_text,
    rarity: s.rarity,
  };
}

// Placeholder stamp image — locked silhouette style
const PLACEHOLDER_IMAGE = STAMP_01; // Reuse stamp-01 as placeholder silhouette

const ALL_STAMPS: StampData[] = [
  // Events (have real art)
  { id: 1, name: 'Treasure Hunter', goal: 'Collect 25 prep items', image: STAMP_01, earned: false, progress: 0, progressText: '0/25', rarity: 'rare' },
  { id: 2, name: 'Deep Dive', goal: 'Collect 50 prep items', image: STAMP_02, earned: false, progress: 0, progressText: '0/50', rarity: 'uncommon' },
  { id: 3, name: 'Shark Scholar', goal: 'Earn 30,000 XP', image: STAMP_03, earned: false, progress: 0, progressText: '0/30k', rarity: 'uncommon' },
  { id: 4, name: 'Captain', goal: 'Earn 10,000 coins', image: STAMP_04, earned: false, progress: 0, progressText: '0/10k', rarity: 'epic' },
  { id: 5, name: 'Pirate King', goal: 'Complete a collection set', image: STAMP_05, earned: false, rarity: 'epic' },
  { id: 6, name: 'Wave Rider', goal: 'Maintain a 7-day streak', image: STAMP_06, earned: false, progress: 0, progressText: '0/7', rarity: 'rare' },
  { id: 7, name: 'Explorer', goal: 'Visit 5 different parks', image: STAMP_07, earned: false, progress: 0, progressText: '0/5', rarity: 'rare' },
  { id: 8, name: 'Beach Day', goal: 'Add 10 friends', image: STAMP_08, earned: false, progress: 0, progressText: '0/10', rarity: 'uncommon' },
  // Regions (placeholder art)
  { id: 10, name: 'Magic Kingdom', goal: 'Check in at Magic Kingdom', image: STAMP_07, earned: false, rarity: 'common' },
  { id: 11, name: 'EPCOT', goal: 'Check in at EPCOT', image: STAMP_03, earned: false, rarity: 'common' },
  { id: 12, name: 'Hollywood Studios', goal: 'Check in at Hollywood Studios', image: STAMP_04, earned: false, rarity: 'common' },
  { id: 13, name: 'Animal Kingdom', goal: 'Check in at Animal Kingdom', image: STAMP_02, earned: false, rarity: 'common' },
  { id: 14, name: 'Universal Studios', goal: 'Check in at Universal Studios', image: STAMP_05, earned: false, rarity: 'uncommon' },
  { id: 15, name: 'Islands of Adv.', goal: 'Check in at Islands of Adventure', image: STAMP_01, earned: false, rarity: 'uncommon' },
  { id: 16, name: 'Epic Universe', goal: 'Check in at Epic Universe', image: STAMP_06, earned: false, rarity: 'rare' },
  { id: 17, name: 'Volcano Bay', goal: 'Check in at Volcano Bay', image: STAMP_08, earned: false, rarity: 'uncommon' },
  // Achievements (placeholder art)
  { id: 20, name: 'First Steps', goal: 'Collect your first prep item', image: STAMP_01, earned: false, progress: 0, progressText: '0/1', rarity: 'common' },
  { id: 21, name: 'Set Collector', goal: 'Complete any collection set', image: STAMP_05, earned: false, rarity: 'uncommon' },
  { id: 22, name: 'Week Warrior', goal: 'Maintain a 7-day streak', image: STAMP_06, earned: false, progress: 0, progressText: '0/7', rarity: 'rare' },
  { id: 23, name: 'Coin Master', goal: 'Earn 10,000 total coins', image: STAMP_04, earned: false, progress: 0, progressText: '0/10k', rarity: 'epic' },
  { id: 24, name: 'Social Shark', goal: 'Add 10 friends', image: STAMP_08, earned: false, progress: 0, progressText: '0/10', rarity: 'uncommon' },
  { id: 25, name: 'XP Machine', goal: 'Earn 30,000 total XP', image: STAMP_03, earned: false, progress: 0, progressText: '0/30k', rarity: 'rare' },
  { id: 26, name: 'Park Hopper', goal: 'Visit 5 different parks', image: STAMP_07, earned: false, progress: 0, progressText: '0/5', rarity: 'rare' },
  { id: 27, name: '???', goal: 'Discover this hidden stamp...', image: STAMP_02, earned: false, rarity: 'legendary' },
];

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
        <View style={[cardStyles.card, { borderColor: stamp.earned ? rarityColor : 'rgba(210,195,170,0.4)' }]}>
          {/* Rarity stripe */}
          <View style={[cardStyles.stripe, { backgroundColor: stamp.earned ? rarityColor : STAMP_LOCKED_COLOR }]} />

          {/* Image */}
          <View style={cardStyles.imageWrap}>
            <Image source={stamp.image || STAMP_01} style={cardStyles.stampImage} contentFit="contain" />
            {!stamp.earned && <View style={cardStyles.lockedOverlay} />}
          </View>

          {/* Name */}
          <Text style={[cardStyles.name, !stamp.earned && { color: 'rgba(255,255,255,0.75)' }]} numberOfLines={1}>
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
              <FontAwesomeIcon icon={faCheck} size={8} color="white" />
            </View>
          ) : (
            <View style={[cardStyles.badge, { backgroundColor: 'rgba(0,0,0,0.4)' }]}>
              <FontAwesomeIcon icon={faLock} size={8} color="rgba(255,255,255,0.7)" />
            </View>
          )}
        </View>
      </Pressable>
    </Animated.View>
  );
}

// ── Main Screen ─────────────────────────────────────────
let cachedApiStamps: StampData[] | null = null;

export default function StampBookScreen() {
  const [stamps, setStamps] = useState<StampData[]>(cachedApiStamps || ALL_STAMPS);
  const [selectedStamp, setSelectedStamp] = useState<StampData | null>(null);
  const [claiming, setClaiming] = useState(false);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        try {
          const resp = await getStamps();
          const flat: StampData[] = [];
          for (const arr of Object.values(resp.stamps)) {
            for (const s of arr as ApiStampData[]) {
              flat.push(apiToLocal(s));
            }
          }
          cachedApiStamps = flat;
          setStamps(flat);
        } catch {
          // Fall back to mock
        }
      })();
    }, [])
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

          {/* Stamp grid */}
          <View style={styles.grid}>
            {stamps.map((stamp, i) => (
              <StampCard key={stamp.id} stamp={stamp} index={i} onPress={() => setSelectedStamp(stamp)} />
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
                  <FontAwesomeIcon icon={faCheck} size={14} color={STAMP_EARNED_COLOR} />
                  <Text style={modalStyles.earnedText}>Earned!</Text>
                </View>
              ) : (
                <View style={modalStyles.lockedBox}>
                  <FontAwesomeIcon icon={faLock} size={14} color={STAMP_LOCKED_COLOR} />
                  <Text style={modalStyles.lockedText}>Locked</Text>
                </View>
              )}

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
    backgroundColor: 'rgba(0,0,0,0.6)',
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
});

const cardStyles = StyleSheet.create({
  wrapper: {
    width: CARD_SIZE,
  },
  card: {
    backgroundColor: 'rgba(60,40,20,0.85)',
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
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
  name: {
    fontFamily: 'Knockout',
    fontSize: 10,
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
  goal: {
    fontFamily: 'Knockout',
    fontSize: 8,
    color: 'rgba(255,255,255,0.65)',
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
    backgroundColor: 'rgba(255,255,255,0.15)',
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
    color: 'rgba(255,255,255,0.4)',
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
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#1a1510',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: GOLD + '50',
    alignItems: 'center',
    padding: 24,
    shadowColor: GOLD,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
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
    backgroundColor: 'rgba(0,0,0,0.15)',
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
    color: '#fff',
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  goalBox: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  goalLabel: {
    fontFamily: 'Knockout',
    fontSize: 9,
    color: GOLD_LIGHT,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  goalText: {
    fontFamily: 'Knockout',
    fontSize: 15,
    color: '#fff',
    lineHeight: 20,
  },
  progressSection: {
    width: '100%',
    marginBottom: 14,
  },
  progressBarBg: {
    width: '100%',
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
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
    color: 'rgba(255,255,255,0.5)',
    textAlign: 'center',
  },
  earnedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(76,175,80,0.15)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  earnedText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: STAMP_EARNED_COLOR,
    fontWeight: '700',
  },
  lockedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
    marginBottom: 12,
  },
  lockedText: {
    fontFamily: 'Knockout',
    fontSize: 16,
    color: 'rgba(255,255,255,0.4)',
  },
  closeHint: {
    fontFamily: 'Knockout',
    fontSize: 11,
    color: 'rgba(255,255,255,0.25)',
    marginTop: 4,
  },
});
