import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { decode } from 'html-entities';
import { Text, TouchableOpacity, View } from 'react-native';
import dayjs from '../../helpers/dayjs';
import { EntryType } from '../../models/entry-type';

export default function Entry({ entry }: { readonly entry: EntryType }) {
  const date =
    dayjs().diff(dayjs(entry.date), 'day') >= 7
      ? dayjs(entry.date).format('MMM D, YYYY')
      : dayjs(entry.date).startOf('second').fromNow();

  return (
    <View
      style={{
        paddingLeft: 16,
        paddingRight: 16,
      }}
    >
      <TouchableOpacity
        style={{
          marginBottom: 32,
          flexDirection: 'row',
        }}
        onPress={() => WebBrowser.openBrowserAsync(entry.url)}
      >
        {entry.featured_image && (
          <View
            style={{
              flex: 1,
              marginRight: 16,
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
        )}
        <View
          style={{
            flex: 1,
          }}
        >
          <Text
            style={{
              fontSize: 18,
            }}
          >
            {decode(entry.title)}
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
    </View>
  );
}
