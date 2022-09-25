import { Text, View } from 'react-native';
import Leaderboard from './Leaderboard';

export default function Leaderboards({ leaderboards })
{
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
