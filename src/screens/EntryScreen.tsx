import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import RenderHtml from 'react-native-render-html';
import { useAsyncEffect } from 'rooks';
import client from '../api/client-cms';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import dayjs from '../helpers/dayjs';
import { EntryType } from '../models/entry-type';

export default function EntryScreen({ route }) {
  const { entry } = route.params;
  const [currentEntry, setCurrentEntry] = useState<EntryType>();
  const [loading, setLoading] = useState<boolean>(true);

  useAsyncEffect(async () => {
    const { data } = await client.get(`/entries/${entry}`);
    setCurrentEntry(data.data);
    setLoading(false);
  }, []);

  return (
    <Wrapper showBar={false}>
      <Topbar showBackButton={true} />
      {loading && <Loading />}
      {!loading && currentEntry && (
        <ScrollView
          style={{
            padding: 16,
          }}
        >
          <View style={{ marginBottom: 16 }}>
            <Image
              style={{
                aspectRatio: 16 / 9,
                borderRadius: 8,
              }}
              source={currentEntry.featured_image}
              contentFit="cover"
            />
          </View>
          <Text
            style={{
              fontSize: 24,
            }}
          >
            {currentEntry.full_headline}
          </Text>
          <Text
            style={{
              marginTop: 8,
            }}
          >
            By {currentEntry.author.name} |{' '}
            {dayjs(currentEntry.published_at).format('MMM D, YYYY')}
          </Text>
          <View>
            <RenderHtml
              contentWidth={Dimensions.get('window').width - 32}
              source={{
                html: currentEntry.content,
              }}
            />
          </View>
        </ScrollView>
      )}
    </Wrapper>
  );
}
