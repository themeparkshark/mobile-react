import * as Haptics from 'expo-haptics';
import { useContext, useState } from 'react';
import { ImageBackground, Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';
import InformationModal from '../components/InformationModal';
import { InformationModalEnums } from '../models/information-modal-enums';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import Experience from './LeaderboardsScreen/Experience';
import ParkCoins from './LeaderboardsScreen/ParkCoins';
import RideStandings from './LeaderboardsScreen/RideStandings';
import { BRAND, GameIcon, type GameIconName } from '../ui';
import useUiReducedMotion from '../ui/useUiReducedMotion';

const whooshSound = require('../../assets/sounds/whoosh.mp3');

const TABS: readonly { key: string; label: string; icon: GameIconName }[] = [
  { key: 'coins', label: 'Park Coins', icon: 'coin' },
  { key: 'rides', label: 'Rides', icon: 'ride' },
  { key: 'xp', label: 'Experience', icon: 'xp' },
];

/** Three tabs on a blue rail; a white pill springs under the chosen one. */
function StandingsTabs({ active, onChange }: { readonly active: number; readonly onChange: (index: number) => void }) {
  const reduced = useUiReducedMotion();
  const [width, setWidth] = useState(0);
  const segment = width / TABS.length;
  const pill = useAnimatedStyle(() => ({
    width: Math.max(0, segment - 8),
    transform: [{ translateX: reduced ? active * segment : withSpring(active * segment, { damping: 17, stiffness: 230 }) }],
  }), [active, segment, reduced]);
  return (
    <View onLayout={event => setWidth(event.nativeEvent.layout.width)} style={{
      flexDirection: 'row', marginHorizontal: 16, marginTop: 12, marginBottom: 4, padding: 4, borderRadius: 18,
      backgroundColor: 'rgba(5,52,110,0.35)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.45)',
    }}>
      {width > 0 && <Animated.View style={[{
        position: 'absolute', top: 4, bottom: 4, left: 4, borderRadius: 14, backgroundColor: BRAND.white,
        borderBottomWidth: 3, borderBottomColor: BRAND.sky,
      }, pill]} />}
      {TABS.map((tab, index) => {
        const selected = active === index;
        return (
          <Pressable key={tab.key} accessibilityRole="tab" accessibilityState={{ selected }}
            onPress={() => { if (!selected) void Haptics.selectionAsync().catch(() => undefined); onChange(index); }}
            style={{ flex: 1, paddingVertical: 9, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}>
            <GameIcon name={tab.icon} size={22} />
            <Text style={{ fontFamily: 'Shark', fontSize: 15, color: selected ? BRAND.navy : BRAND.white }}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function LeaderboardScreen() {
  const [activeTab, setActiveTab] = useState(0);
  const { playSound } = useContext(SoundEffectContext);

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false} />
        <TopbarColumn>
          <TopbarText>Standings</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <InformationModal id={InformationModalEnums.LeaderboardScreen} />
        </TopbarColumn>
      </Topbar>
      <View
        style={{
          marginTop: -8,
          flex: 1,
        }}
      >
        <ImageBackground
          style={{
            flex: 1,
          }}
          source={require('../../assets/images/screens/leaderboard/standings-bg.png')}
        >
          <StandingsTabs active={activeTab} onChange={index => {
            if (activeTab !== index) playSound(whooshSound);
            setActiveTab(index);
          }} />

          {/* Tab content remounts for fresh animations; cached data skips the loader. */}
          <View style={{ flex: 1 }}>
            {activeTab === 0 ? <ParkCoins /> : activeTab === 1 ? <RideStandings /> : <Experience />}
          </View>
        </ImageBackground>
      </View>
    </Wrapper>
  );
}
