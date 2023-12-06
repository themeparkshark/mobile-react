import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import { ReactionType } from '../models/reaction-type';

export default function Reactions({
  reactions,
  count,
}: {
  readonly count: number;
  readonly reactions: ReactionType[];
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
      }}
    >
      {reactions.map((reaction, key) => {
        return (
          <View
            key={reaction.id}
            style={{
              marginLeft: key > 0 ? -6 : 0,
            }}
          >
            <Image
              source={{
                uri: reaction.reaction_type.image_url,
              }}
              style={{
                width: 20,
                height: 20,
              }}
            />
          </View>
        );
      })}
      <View>
        <Text
          style={{
            paddingLeft: 8,
          }}
        >
          {count}
        </Text>
      </View>
    </View>
  );
}
