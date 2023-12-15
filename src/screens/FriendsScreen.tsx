import { Image } from 'expo-image';
import { useContext } from 'react';
import { ImageBackground, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import Button from '../components/Button';
import Tabs from '../components/Tabs';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import { AuthContext } from '../context/AuthProvider';
import Suggestions from './FriendsScreen/Suggestions';
import YourList from './FriendsScreen/YourList';

export default function FriendsScreen() {
  const { player } = useContext(AuthContext);

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
              source={require('../../assets/images/screens/friends/pending_requests.png')}
              style={{
                width: 35,
                height: 35,
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
        }}
      >
        <ImageBackground
          style={{
            flex: 1,
          }}
          source={require('../../assets/images/seaweed_background.png')}
        >
          <View
            style={{
              flex: 1,
              overflow: 'hidden',
            }}
          >
            <Tabs
              items={['Your friends', 'Search Everyone']}
              views={[<YourList />, <Suggestions />]}
            />
          </View>
        </ImageBackground>
      </View>
    </>
  );
}
