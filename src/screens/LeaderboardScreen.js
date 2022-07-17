import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import { Text } from 'react-native';

export default function LeaderboardScreen() {
  return (
    <Wrapper>
      <Topbar text="Leaderboard" />
      <Text>Leaderboard screen</Text>
    </Wrapper>
  );
};
