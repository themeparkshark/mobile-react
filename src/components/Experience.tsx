import { UserType } from '../models/user-type';
import { Text, View } from 'react-native';
import Progress from './Progress';

export default function Experience({ user }: { readonly user: UserType }) {
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
        Level {user.experience_level.level}
      </Text>
      <View
        style={{
          paddingLeft: 48,
          paddingRight: 48,
        }}
      >
        <Progress
          progress={(user.experience / user.experience_level.experience) * 100}
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
        {user.experience} / {user.experience_level.experience} XP
      </Text>
    </>
  );
}
