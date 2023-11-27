import { ImageBackground, View } from 'react-native';
import InformationModal from '../components/InformationModal';
import Tabs from '../components/Tabs';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import Experience from './LeaderboardsScreen/Experience';
import ParkCoins from './LeaderboardsScreen/ParkCoins';

export default function LeaderboardScreen() {
  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch={false} />
        <TopbarColumn>
          <TopbarText>Standings</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <InformationModal />
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
            }}
          >
            <Tabs
              items={['Park Coins', 'Experience']}
              views={[<ParkCoins />, <Experience />]}
            />
          </View>
        </ImageBackground>
      </View>
    </Wrapper>
  );
}
