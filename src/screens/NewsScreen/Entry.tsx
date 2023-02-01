import { Image } from 'expo-image';
import { Text, TouchableOpacity, View } from 'react-native';
import dayjs from '../../helpers/dayjs';
import { EntryType } from '../../models/entry-type';
import * as RootNavigation from '../../RootNavigation';

export default function Entry({
  entry,
  horizontal = true,
}: {
  readonly entry: EntryType;
  readonly horizontal?: boolean;
}) {
  const date =
    dayjs().diff(dayjs(entry.published_at), 'day') >= 7
      ? dayjs(entry.published_at).format('MMM D, YYYY')
      : dayjs(entry.published_at).startOf('second').fromNow();

  return (
    <TouchableOpacity
      style={{
        marginBottom: 32,
        flexDirection: horizontal ? 'row' : 'column',
      }}
      onPress={() => RootNavigation.navigate('Entry', { entry: entry.id })}
    >
      <View
        style={{
          flex: 1,
        }}
      >
        <Image
          style={{
            aspectRatio: 16 / 9,
            borderRadius: 8,
          }}
          source={entry.featured_image}
          contentFit="cover"
        />
      </View>
      <View
        style={{
          flex: 1,
          marginLeft: horizontal ? 16 : 0,
        }}
      >
        <Text
          style={{
            marginTop: horizontal ? 0 : 16,
            fontSize: 18,
          }}
        >
          {entry.headline ?? entry.full_headline}
        </Text>
        <Text
          style={{
            marginTop: 8,
          }}
        >
          {date}
        </Text>
      </View>
    </TouchableOpacity>
  );
}
