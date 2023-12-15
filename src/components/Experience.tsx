import { Text, View } from 'react-native';
import { vsprintf } from 'sprintf-js';
import useCrumbs from '../hooks/useCrumbs';
import { PlayerType } from '../models/player-type';
import Progress from './Progress';

export default function Experience({
  player,
}: {
  readonly player: PlayerType;
}) {
  const { labels } = useCrumbs();

  return (
    <>
      <Text
        style={{
          fontFamily: 'Knockout',
          textTransform: 'uppercase',
          textAlign: 'center',
          fontSize: 32,
          paddingBottom: 8,
        }}
      >
        {vsprintf(labels.experience_level, [player.experience_level.level])}
      </Text>
      <View
        style={{
          paddingLeft: 48,
          paddingRight: 48,
        }}
      >
        <Progress
          progress={
            (player.experience / player.experience_level.experience) * 100
          }
        />
      </View>
      <Text
        style={{
          paddingTop: 8,
          textAlign: 'center',
          fontFamily: 'Knockout',
          fontSize: 20,
        }}
      >
        {vsprintf(labels.experience, [
          player.experience,
          player.experience_level.experience,
        ])}
      </Text>
    </>
  );
}
