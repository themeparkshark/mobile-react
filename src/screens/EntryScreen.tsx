import { useState } from 'react';
import { Dimensions, ScrollView, Text, View } from 'react-native';
import RenderHtml from 'react-native-render-html';
import { useAsyncEffect } from 'rooks';
import client from '../api/client-cms';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
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
    <>
      <Topbar showBackButton={true} />
      {loading && <Loading />}
      {!loading && currentEntry && (
        <ScrollView
          style={{
            marginTop: -8,
          }}
        >
          <View
            style={{
              padding: 16,
            }}
          >
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
                baseStyle={{
                  fontSize: 16,
                }}
                contentWidth={Dimensions.get('window').width - 32}
                source={{
                  html: currentEntry.content,
                }}
              />
            </View>
          </View>
        </ScrollView>
      )}
    </>
  );
}
