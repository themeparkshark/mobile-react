import { Dimensions, ScrollView, Text, View } from 'react-native';
import RenderHtml from 'react-native-render-html';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { UserType } from '../models/user-type';

export default function EntryScreen({ route }) {
  const { entry } = route.params;

  return (
    <Wrapper showBar={false}>
      <Topbar showBackButton={true} />
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
          By {entry.contributors.map((user: UserType) => user.name).join(', ')}
        </Text>
        <View>
          <RenderHtml
            contentWidth={Dimensions.get('window').width - 32}
            source={{
              html: entry.content,
            }}
          />
        </View>
      </ScrollView>
    </Wrapper>
  );
}
