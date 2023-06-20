import { Text, View } from 'react-native';
import config from '../config';
import { TagType } from '../models/tag-type';

export default function Tag({ tag }: { readonly tag: TagType }) {
  return (
    <View
      style={{
        paddingLeft: 5,
        paddingRight: 5,
        paddingTop: 5,
        paddingBottom: 5,
        borderRadius: 5,
        backgroundColor: config.secondary,
        marginBottom: 8,
        marginRight: 8,
      }}
    >
      <Text
        style={{
          fontSize: 12,
        }}
      >
        {tag.name}
      </Text>
    </View>
  );
}
