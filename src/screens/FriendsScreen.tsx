import { Image } from 'expo-image';
import { useContext } from 'react';
import { ImageBackground, View } from 'react-native';
import Button from '../components/Button';
import Tabs from '../components/Tabs';
import Topbar from '../components/Topbar';
import { AuthContext } from '../context/AuthProvider';
import * as RootNavigation from '../RootNavigation';
import Suggestions from './FriendsScreen/Suggestions';
import YourList from './FriendsScreen/YourList';

export default function FriendsScreen() {
  const { user } = useContext(AuthContext);

  return (
    <>
      <Topbar
        text="Friends"
        showBackButton={true}
        rightButton={
          <Button
            onPress={() => {
              RootNavigation.navigate('PendingFriendRequests');
            }}
            showRedCircle={user?.has_pending_friend_requests}
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
        }
      />
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
            }}
          >
            <Tabs
              items={['Your list', 'Suggestions']}
              views={[<YourList />, <Suggestions />]}
            />
          </View>
        </ImageBackground>
      </View>
    </>
  );
}
