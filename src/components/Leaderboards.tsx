import { View } from 'react-native';
import Leaderboard from './Leaderboard';
import { LeaderboardType } from '../models/leaderboard-type';

export default function Leaderboards({
  leaderboards,
}: {
  leaderboards: LeaderboardType[];
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
      }}
    >
      {leaderboards.map((leaderboard) => {
        return (
          <View
            key={leaderboard.id}
            style={{
              flex: 1,
            }}
          >
            <Leaderboard leaderboard={leaderboard} />
          </View>
        );
      })}
    </View>
  );
}
