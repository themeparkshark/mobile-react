import { useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Cell, Section, TableView } from 'react-native-tableview-simple';
import { LinearGradient } from 'expo-linear-gradient';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import MiniGameSelector from '../components/MiniGameSelector';
import PostWinRewardsModal from '../components/PostWinRewardsModal';
import { CoinUpgradeDemoScreen } from '../components/CoinUpgradeDemo';
import AnimatedShark from '../components/AnimatedShark';
import Wrapper from '../components/Wrapper';

type GameType = 'tap' | 'timing' | 'memory' | 'trivia' | 'shark' | 'photo' | 'random';

const GAMES: { type: GameType; label: string; emoji: string; desc: string }[] = [
  { type: 'random', label: 'Random', emoji: '[?]', desc: 'Randomly picks a mini-game' },
  { type: 'tap', label: 'Whack-a-Shark', emoji: '[!]', desc: 'Tap targets before they disappear' },
  { type: 'timing', label: 'Rhythm Tap', emoji: '[>]', desc: 'Time your taps in the hit zone' },
  { type: 'memory', label: 'Memory Match', emoji: '[=]', desc: 'Find matching pairs of cards' },
  { type: 'trivia', label: 'Park Trivia', emoji: '[Q]', desc: 'Answer Disney park questions' },
  { type: 'shark', label: 'Sharky Swim', emoji: '[~]', desc: 'Swim through coral, Flappy-style 3D' },
];

const RIDE_SPRINTS: { type: GameType; number: string; label: string; desc: string; cue: string }[] = [
  { type: 'tap', number: '01', label: 'Whack-a-Shark', desc: '25 seconds of quick reactions', cue: 'TAP' },
  { type: 'photo', number: '02', label: 'Snap the Ride', desc: 'Frame the entrance and snap it', cue: 'SNAP' },
  { type: 'memory', number: '03', label: 'Memory Match', desc: 'Find four pairs as fast as you can', cue: 'MATCH' },
  { type: 'trivia', number: '04', label: 'Park Trivia', desc: 'Two fast park questions', cue: 'THINK' },
];

export default function MiniGameTesterScreen() {
  const navigation = useNavigation<any>();
  const ridePreview = __DEV__ && process.env.EXPO_PUBLIC_RIDE_GAME_PREVIEW === '1';
  const previewRideName = ridePreview
    ? process.env.EXPO_PUBLIC_RIDE_GAME_PREVIEW_TASK || 'Space Mountain'
    : 'Space Mountain';
  const [activeGame, setActiveGame] = useState<GameType | null>(null);
  const [showPostWin, setShowPostWin] = useState(false);
  const [lastResult, setLastResult] = useState<string>('');

  const handlePlay = (type: GameType) => {
    setActiveGame(type);
  };

  const handleComplete = (multiplier: number, rewards: { coins: number; xp: number }) => {
    setActiveGame(null);
    setLastResult(ridePreview
      ? `[WIN] Ride game cleared at ${multiplier}x. Rewards are server-owned in the real attempt.`
      : `[WIN] Won! Multiplier: ${multiplier}x | Coins: ${rewards.coins} | XP: ${rewards.xp}`);
    // Show post-win modal as demo
    if (!ridePreview) setShowPostWin(true);
  };

  const handleClose = () => {
    setActiveGame(null);
    setLastResult(ridePreview ? 'Practice ended. Pick another game whenever you like.' : '[X] Closed/Failed');
  };

  return (
    <>
      <Wrapper previewMode={ridePreview}>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>{ridePreview ? 'Ride Sprint Preview' : '[G] Mini-Game Tester'}</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <SafeAreaView style={{ marginTop: -8, flex: 1, backgroundColor: ridePreview ? '#dff4ff' : '#0d0d1a' }}>
        {ridePreview ? <ScrollView contentContainerStyle={styles.rideContent}>
          <LinearGradient colors={['#0e8bd0', '#0865ac', '#064578']} style={styles.rideHero}>
            <View style={styles.rideHeroCopy}>
              <Text style={styles.rideEyebrow}>THE SHARK ARCADE  ✦</Text>
              <Text style={styles.rideHeading}>RIDE SPRINTS</Text>
              <Text style={styles.rideHeroHint}>Fast games for the moment you reach a ride.</Text>
            </View>
            <AnimatedShark size={130} />
          </LinearGradient>
          <View style={styles.practiceNotice}>
            <Text style={styles.practiceTitle}>PRACTICE MODE</Text>
            <Text style={styles.practiceBody}>Try four ride games. Real challenges assign one and use a Ticket; practice uses none.</Text>
          </View>
          {lastResult ? <View style={styles.rideResult}>
            <Text style={styles.rideResultText}>{lastResult}</Text>
          </View> : null}
          <Text style={styles.rideSectionTitle}>CHOOSE A GAME TO TRY</Text>
          {RIDE_SPRINTS.map(game => <TouchableOpacity key={game.type}
            accessibilityRole="button" accessibilityLabel={`Practice ${game.label}. ${game.desc}`}
            activeOpacity={0.82} style={styles.rideCard} onPress={() => handlePlay(game.type)}>
            <View style={styles.rideNumber}><Text style={styles.rideNumberText}>{game.number}</Text></View>
            <View style={styles.rideCardCopy}>
              <Text style={styles.rideCardTitle}>{game.label}</Text>
              <Text style={styles.rideCardDesc}>{game.desc}</Text>
            </View>
            <View style={styles.rideCue}><Text style={styles.rideCueText}>{game.cue} ›</Text></View>
          </TouchableOpacity>)}
          <Text style={styles.rideFooter}>THE REAL CHALLENGE KEEPS YOUR COIN AND REWARDS ON THE SERVER.</Text>
        </ScrollView> : <ScrollView>
          {lastResult ? (
            <View style={styles.resultBanner}>
              <Text style={styles.resultText}>{lastResult}</Text>
            </View>
          ) : null}

          <TableView>
            <Section
              header={'Mini-Games'.toUpperCase()}
              footer="Tap any game to play. Results shown above."
            >
              {GAMES.filter(game => !ridePreview || game.type === 'random' ||
                game.type === 'tap' || game.type === 'timing' ||
                game.type === 'memory' || game.type === 'trivia').map((game) => (
                <Cell
                  key={game.type}
                  title={`${game.emoji}  ${game.label}`}
                  cellStyle="Subtitle"
                  detail={game.desc}
                  accessory="DisclosureIndicator"
                  onPress={() => handlePlay(game.type)}
                />
              ))}
            </Section>

            <Section
              header={'GameKit Engine (Wave 1)'.toUpperCase()}
              footer="Exercises every gamekit primitive at 60fps."
            >
              <Cell
                title="[GYM]  GameKit Gym"
                cellStyle="Subtitle"
                detail="Particles, shake, combo, FPS counter — engine stress test"
                accessory="DisclosureIndicator"
                onPress={() => navigation.navigate('GameKitGym')}
              />
            </Section>

            <Section header={'Skia Animated Shark (Proof of Concept)'.toUpperCase()}>
              <Cell
                cellContentView={
                  <View style={{ alignItems: 'center', paddingVertical: 20, backgroundColor: '#1a1a2e' }}>
                    <AnimatedShark size={120} />
                    <Text style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
                      Skia Atlas + Reanimated — 36 frames @ 60fps
                    </Text>
                  </View>
                }
              />
            </Section>

            <Section header={'Queue Mini-Games'.toUpperCase()}>
              <Cell
                title="[3D]  Banana Basket"
                cellStyle="Subtitle"
                detail="Despicable Me queue — wood scene, bananas/apples/oranges, combo multiplier"
                accessory="DisclosureIndicator"
                onPress={() => navigation.navigate('BananaBasket')}
              />
            </Section>

            <Section header={'Coin Upgrade Levels'.toUpperCase()}>
              <Cell
                cellContentView={<CoinUpgradeDemoScreen />}
              />
            </Section>

            <Section header={'Post-Win Modal'.toUpperCase()}>
              <Cell
                title="[+]  Test Bonus Rewards Modal"
                cellStyle="Subtitle"
                detail="Shows ride parts + energy earned"
                accessory="DisclosureIndicator"
                onPress={() => setShowPostWin(true)}
              />
            </Section>
          </TableView>
        </ScrollView>}
      </SafeAreaView>
      </Wrapper>

      {/* Mini-Game */}
      <MiniGameSelector
        visible={activeGame !== null}
        taskId={999}
        taskName={previewRideName}
        coinImageUrl={undefined}
        preferredGame={activeGame === 'random' ? undefined : activeGame ?? undefined}
        rewardMode={ridePreview ? 'task-attempt' : 'legacy'}
        isPractice={ridePreview}
        parkId={ridePreview ? 2 : undefined}
        onClose={handleClose}
        onComplete={handleComplete}
      />

      {/* Post-Win Modal */}
      <PostWinRewardsModal
        visible={showPostWin}
        rideName="Space Mountain"
        coinsEarned={20}
        xpEarned={40}
        ridePartsEarned={3}
        energyEarned={25}
        coinTimesCollected={1}
        onClose={() => setShowPostWin(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  rideContent: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 36 },
  rideHero: { minHeight: 132, borderRadius: 20, borderWidth: 3, borderColor: '#fff',
    flexDirection: 'row', alignItems: 'center', overflow: 'hidden', paddingLeft: 15,
    shadowColor: '#003b76', shadowOpacity: 0.22, shadowRadius: 6,
    shadowOffset: { width: 0, height: 5 }, elevation: 5 },
  rideHeroCopy: { flex: 1, paddingVertical: 16 },
  rideEyebrow: { color: '#ffdb68', fontFamily: 'Knockout', fontSize: 13, letterSpacing: 0.8 },
  rideHeading: { color: '#fff', fontFamily: 'Shark', fontSize: 26, marginTop: 5 },
  rideHeroHint: { color: '#e8f8ff', fontFamily: 'Knockout', fontSize: 15, lineHeight: 19, marginTop: 6 },
  practiceNotice: { backgroundColor: '#fff9e5', borderColor: '#ffca30', borderWidth: 2,
    borderRadius: 14, padding: 9, marginTop: 11 },
  practiceTitle: { color: '#a06b00', fontFamily: 'Shark', fontSize: 15 },
  practiceBody: { color: '#315a79', fontFamily: 'Knockout', fontSize: 13, lineHeight: 17, marginTop: 3 },
  rideResult: { backgroundColor: '#dff7e8', borderColor: '#77cfa1', borderWidth: 2,
    borderRadius: 13, padding: 10, marginTop: 12 },
  rideResultText: { color: '#135741', fontFamily: 'Knockout', fontSize: 13 },
  rideSectionTitle: { color: '#07528d', fontFamily: 'Shark', fontSize: 19,
    marginTop: 18, marginBottom: 8 },
  rideCard: { minHeight: 70, flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 15, borderWidth: 2, borderColor: '#83c6ea',
    padding: 9, marginBottom: 7, shadowColor: '#003b76', shadowOpacity: 0.1,
    shadowRadius: 3, shadowOffset: { width: 0, height: 3 }, elevation: 2 },
  rideNumber: { width: 44, height: 44, borderRadius: 13, backgroundColor: '#0879ca',
    borderWidth: 2, borderColor: '#ffca30', alignItems: 'center', justifyContent: 'center', marginRight: 10 },
  rideNumberText: { color: '#fff', fontFamily: 'Shark', fontSize: 17 },
  rideCardCopy: { flex: 1, minWidth: 0 },
  rideCardTitle: { color: '#073e79', fontFamily: 'Shark', fontSize: 17 },
  rideCardDesc: { color: '#467393', fontFamily: 'Knockout', fontSize: 12, marginTop: 2 },
  rideCue: { marginLeft: 5 },
  rideCueText: { color: '#0879ca', fontFamily: 'Knockout', fontSize: 12 },
  rideFooter: { color: '#547b95', fontFamily: 'Knockout', fontSize: 11,
    textAlign: 'center', lineHeight: 15, marginTop: 9, paddingHorizontal: 20 },
  resultBanner: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 12,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  resultText: {
    color: '#fff',
    fontSize: 14,
    textAlign: 'center',
  },
});
