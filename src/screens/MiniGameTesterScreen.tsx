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
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import MiniGameSelector from '../components/MiniGameSelector';
import PostWinRewardsModal from '../components/PostWinRewardsModal';
import { CoinUpgradeDemoScreen } from '../components/CoinUpgradeDemo';
import AnimatedShark from '../components/AnimatedShark';

type GameType = 'tap' | 'timing' | 'memory' | 'trivia' | 'shark' | 'random';

const GAMES: { type: GameType; label: string; emoji: string; desc: string }[] = [
  { type: 'random', label: 'Random', emoji: '[?]', desc: 'Randomly picks a mini-game' },
  { type: 'tap', label: 'Whack-a-Shark', emoji: '[!]', desc: 'Tap targets before they disappear' },
  { type: 'timing', label: 'Rhythm Tap', emoji: '[>]', desc: 'Time your taps in the hit zone' },
  { type: 'memory', label: 'Memory Match', emoji: '[=]', desc: 'Find matching pairs of cards' },
  { type: 'trivia', label: 'Park Trivia', emoji: '[Q]', desc: 'Answer Disney park questions' },
  { type: 'shark', label: 'Sharky Swim', emoji: '[~]', desc: 'Swim through coral, Flappy-style 3D' },
];

export default function MiniGameTesterScreen() {
  const navigation = useNavigation<any>();
  const [activeGame, setActiveGame] = useState<GameType | null>(null);
  const [showPostWin, setShowPostWin] = useState(false);
  const [lastResult, setLastResult] = useState<string>('');

  const handlePlay = (type: GameType) => {
    setActiveGame(type);
  };

  const handleComplete = (multiplier: number, rewards: { coins: number; xp: number }) => {
    setActiveGame(null);
    setLastResult(`[WIN] Won! Multiplier: ${multiplier}x | Coins: ${rewards.coins} | XP: ${rewards.xp}`);
    // Show post-win modal as demo
    setShowPostWin(true);
  };

  const handleClose = () => {
    setActiveGame(null);
    setLastResult('[X] Closed/Failed');
  };

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>[G] Mini-Game Tester</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      <SafeAreaView style={{ marginTop: -8, flex: 1, backgroundColor: '#0d0d1a' }}>
        <ScrollView>
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
              {GAMES.map((game) => (
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

            <Section header={'Queue Mini-Games (3D)'.toUpperCase()}>
              <Cell
                title="[3D]  Banana Basket"
                cellStyle="Subtitle"
                detail="Despicable Me queue — drag to catch falling bananas"
                accessory="DisclosureIndicator"
                onPress={() => navigation.navigate('QueueGame')}
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
        </ScrollView>
      </SafeAreaView>

      {/* Mini-Game */}
      <MiniGameSelector
        visible={activeGame !== null}
        taskId={999}
        taskName="Space Mountain"
        coinImageUrl={undefined}
        preferredGame={activeGame === 'random' ? undefined : activeGame ?? undefined}
        onClose={handleClose}
        onComplete={handleComplete}
      />

      {/* Post-Win Modal */}
      <PostWinRewardsModal
        visible={showPostWin}
        rideName="Space Mountain"
        ridePartsEarned={3}
        energyEarned={25}
        onClose={() => setShowPostWin(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
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
