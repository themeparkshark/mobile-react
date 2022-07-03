import { Dimensions, ScrollView, SafeAreaView, Text } from 'react-native';
import RenderHtml from 'react-native-render-html';

export default function EntryScreen({ route }) {
  const { entry } = route.params;

  return (
    <SafeAreaView>
      <ScrollView
        style={{
          padding: 16,
        }}
      >
        <Text
          style={{
            fontSize: 24,
          }}
        >
          {entry.headline ?? entry.full_headline}
        </Text>
        <Text
          style={{
            marginTop: 8,
          }}
        >
          By {entry.contributors.map((user) => user.name).join(', ')}
        </Text>
        <RenderHtml
          contentWidth={Dimensions.get('window').width}
          source={{
            html: entry.content,
          }}
        />
      </ScrollView>
    </SafeAreaView>
  )
}
