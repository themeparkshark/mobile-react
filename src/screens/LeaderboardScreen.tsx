import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import { ImageBackground, Text, TouchableOpacity, View } from 'react-native';
import InformationModal from '../components/InformationModal';
import { InformationModalEnums } from '../models/information-modal-enums';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import config from '../config';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import Experience from './LeaderboardsScreen/Experience';
import ParkCoins from './LeaderboardsScreen/ParkCoins';

const whooshSound = require('../../assets/sounds/whoosh.mp3');

const TABS = [
  { key: 'coins', label: 'Park Coins', icon: require('../../assets/images/coingold.png') },
  { key: 'xp', label: 'Experience', icon: require('../../assets/images/screens/explore/xp.png') },
];

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
          {/* Tab Picker */}
          <View
            style={{
              flexDirection: 'row',
              marginHorizontal: 16,
              marginTop: 12,
              marginBottom: 4,
              backgroundColor: 'rgba(0,0,0,0.25)',
              borderRadius: 16,
              padding: 4,
            }}
          >
            {TABS.map((tab, index) => {
              const isActive = activeTab === index;
              return (
                <TouchableOpacity
                  key={tab.key}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (activeTab !== index) playSound(whooshSound);
                    setActiveTab(index);
                  }}
                  style={{
                    flex: 1,
                    paddingVertical: 10,
                    borderRadius: 13,
                    backgroundColor: isActive ? config.secondary : 'transparent',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'row',
                    ...(isActive
                      ? {
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.2,
                          shadowRadius: 4,
                          elevation: 4,
                        }
                      : {}),
                  }}
                >
                  <Image source={tab.icon} style={{ width: 18, height: 18, marginRight: 6 }} contentFit="contain" />
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 16,
                      color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
                      textShadowColor: isActive ? 'rgba(0,0,0,0.2)' : 'transparent',
                      textShadowRadius: isActive ? 2 : 0,
                    }}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Tab Content — remounts for fresh animations, cached data = no loading spinner */}
          <View style={{ flex: 1 }}>
            {activeTab === 0 ? <ParkCoins /> : <Experience />}
          </View>
        </ImageBackground>
      </View>
    </Wrapper>
  );
}
