import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import dayjs from '../../helpers/dayjs';
import * as RootNavigation from '../../RootNavigation';
import { EntryType } from '../../models/entry-type';

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
    <Pressable
      key={entry.id}
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
            resizeMode: 'cover',
            borderRadius: 8,
          }}
          source={entry.featured_image}
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
    </Pressable>
  );
}
