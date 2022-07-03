import { Image, Pressable, Text, View } from 'react-native';
import dayjs from '../../helpers/dayjs';
import * as RootNavigation from '../../RootNavigation';

export default function Entry({ entry, horizontal = true }) {
  const date = dayjs().diff(dayjs(entry.published_at), 'day') >= 7
    ? dayjs(entry.published_at).format('MMM D, YYYY')
    : dayjs(entry.published_at).startOf('second').fromNow();

  return (
    <Pressable
      key={entry.id}
      style={{
        marginBottom: 32,
        flexDirection: horizontal ? 'row' : 'column',
      }}
      onPress={() => RootNavigation.navigate('Entry', { entry })}
    >
      <View
        style={{
          flex: 1,
        }}
      >
        <Image
          style={{
            aspectRatio: 16/9,
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
          {date} | {entry.category[0].name }
        </Text>
      </View>
    </Pressable>
  );
}
