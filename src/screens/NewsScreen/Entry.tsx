import { Image } from 'expo-image';
import { Text, TouchableOpacity, View } from 'react-native';
import dayjs from '../../helpers/dayjs';
import { EntryType } from '../../models/entry-type';
import * as RootNavigation from '../../RootNavigation';

export default function Entry({ entry }: { readonly entry: EntryType }) {
  const date =
    dayjs().diff(dayjs(entry.published_at), 'day') >= 7
      ? dayjs(entry.published_at).format('MMM D, YYYY')
      : dayjs(entry.published_at).startOf('second').fromNow();

  return (
    <TouchableOpacity
      style={{
        marginBottom: 32,
        flexDirection: 'row',
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
          marginLeft: 16,
        }}
      >
        <Text
          style={{
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
