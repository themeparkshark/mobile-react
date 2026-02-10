import { Image } from 'expo-image';
import { useContext, useState, useEffect } from 'react';
import { ImageBackground, Text, TouchableOpacity, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import Button from '../components/Button';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import Suggestions from './FriendsScreen/Suggestions';
import YourList from './FriendsScreen/YourList';
import { useTutorial } from '../components/Tutorial';

const whooshSound = require('../../assets/sounds/whoosh.mp3');

const TABS = [
  { key: 'friends', label: 'Your Friends' },
  { key: 'search', label: 'Search' },
];

export default function FriendsScreen() {
  const { player } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState(0);
  const { playSound } = useContext(SoundEffectContext);
  const { startTutorial, hasCompleted } = useTutorial();
  
  // Trigger friends tutorial on first visit
  useEffect(() => {
    if (!hasCompleted('friends')) {
      const timer = setTimeout(() => startTutorial('friends'), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Friends</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <Button
            onPress={() => {
              RootNavigation.navigate('PendingFriendRequests');
            }}
            showRedCircle={player?.has_pending_friend_requests}
          >
            <Image
              source={require('../../assets/images/screens/friends/noti.png')}
              style={{
                width: 44,
                height: 44,
              }}
              contentFit="contain"
            />
          </Button>
        </TopbarColumn>
      </Topbar>
      <View
        style={{
          marginTop: -8,
          flex: 1,
          backgroundColor: '#0a1628',
        }}
      >
        <ImageBackground
          style={{ flex: 1 }}
          source={require('../../assets/images/screens/leaderboard/standings-bg.png')}
          imageStyle={{ opacity: 0.4 }}
        >
          {/* Tab Picker — matches Standings style */}
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

          {/* Content */}
          <View style={{ flex: 1 }}>
            {activeTab === 0 ? <YourList /> : <Suggestions />}
          </View>
        </ImageBackground>
      </View>
    </>
  );
}
