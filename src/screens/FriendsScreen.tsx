import { Image } from 'expo-image';
import { useContext, useState } from 'react';
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
import { useTutorialWhenReady } from '../components/Tutorial';

const whooshSound = require('../../assets/sounds/whoosh.mp3');

const TABS = [
  { key: 'friends', label: 'Your Friends' },
  { key: 'search', label: 'Search' },
];

export default function FriendsScreen() {
  const { player } = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState(0);
  const { playSound } = useContext(SoundEffectContext);
  const [listReady, setListReady] = useState(false);

  // First visit: Finn explains Friends once the list (or its empty or error state) is on screen, never over a spinner.
  useTutorialWhenReady('friends', listReady);

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
          backgroundColor: '#0768b9',
        }}
      >
        <ImageBackground
          style={{ flex: 1 }}
          source={require('../../assets/images/screens/leaderboard/standings-bg.png')}

        >
          {/* Tab Picker — matches Standings style */}
          <View
            style={{
              flexDirection: 'row',
              marginHorizontal: 16,
              marginTop: 12,
              marginBottom: 4,
              backgroundColor: 'rgba(5,52,110,0.35)',
              borderWidth: 2,
              borderColor: 'rgba(255,255,255,0.45)',
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
                          shadowColor: '#05346e',
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
                      textShadowColor: isActive ? 'rgba(5,52,110,0.3)' : 'transparent',
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
            {activeTab === 0 ? <YourList onReady={() => setListReady(true)} /> : <Suggestions />}
          </View>
        </ImageBackground>
      </View>
    </>
  );
}
