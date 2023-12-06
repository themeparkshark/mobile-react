import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import shortenNumber from '../helpers/shorten-number';
import { ReactionType } from '../models/reaction-type';

export default function Reactions({
  hasReacted,
  reactions,
  count,
}: {
  readonly hasReacted?: ReactionType;
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
          {hasReacted
            ? `You and ${shortenNumber(count - 1)} other${
                count - 1 === 1 ? '' : 's'
              }`
            : shortenNumber(count)}
        </Text>
      </View>
    </View>
  );
}
