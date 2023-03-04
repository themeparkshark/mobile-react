import { ImageBackground, View } from 'react-native';
import Tabs from '../components/Tabs';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import Experience from './LeaderboardsScreen/Experience';
import ParkCoins from './LeaderboardsScreen/ParkCoins';

export default function LeaderboardScreen({ route }) {
  return (
    <Wrapper>
      <Topbar text="Standings" />
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
              items={['Park Coins', 'Experience']}
              views={[<ParkCoins route={route} />, <Experience />]}
            />
          </View>
        </ImageBackground>
      </View>
    </Wrapper>
  );
}
