import { FlashList } from '@shopify/flash-list';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, RefreshControl, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useAsyncEffect } from 'rooks';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Wrapper from '../components/Wrapper';
import config from '../config';
import { EntryType } from '../models/entry-type';
import Entry from './NewsScreen/Entry';

/** Fun animated refresh banner shown while pulling fresh news */
function RefreshBanner() {
  const spinAnim = useRef(new Animated.Value(0)).current;
  const bounceAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Spin the shark icon
    Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 1200,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    ).start();

    // Bounce dots
    Animated.loop(
      Animated.sequence([
        Animated.timing(bounceAnim, {
          toValue: 1,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(bounceAnim, {
          toValue: 0,
          duration: 400,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const dotBounce = bounceAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -6],
  });

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 16,
        gap: 10,
      }}
    >
      <Animated.View style={{ transform: [{ rotate: spin }] }}>
        <Image
          source={require('../../assets/images/coingold.png')}
          style={{ width: 28, height: 28 }}
          contentFit="contain"
        />
      </Animated.View>
      <Text
        style={{
          fontFamily: 'Shark',
          fontSize: 14,
          color: config.primary,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Fetching latest news
      </Text>
      {[0, 1, 2].map((i) => (
        <Animated.View
          key={i}
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: config.secondary,
            transform: [{
              translateY: bounceAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [0, -6],
                // Stagger each dot
              }),
            }],
            opacity: bounceAnim.interpolate({
              inputRange: [0, 0.5, 1],
              outputRange: i === 0 ? [0.4, 1, 0.4] : i === 1 ? [1, 0.4, 1] : [0.4, 1, 0.4],
            }),
          }}
        />
      ))}
    </View>
  );
}

export default function NewsScreen() {
  const [entries, setEntries] = useState<EntryType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchEntries = async () => {
    return axios
      .get('https://themeparkshark.com/wp-json/wp/v2/posts?_embed&per_page=20')
      .then((response) => {
        setEntries(
          response.data.map((item: any) => {
            let featured_image = null;
            try {
              const media = item._embedded?.['wp:featuredmedia']?.[0];
              featured_image =
                media?.media_details?.sizes?.medium_large?.source_url ||
                media?.media_details?.sizes?.medium?.source_url ||
                media?.source_url ||
                null;
            } catch (e) {
              featured_image = null;
            }

            // Get full-size image for article reader
            let featured_image_full = null;
            try {
              const media = item._embedded?.['wp:featuredmedia']?.[0];
              featured_image_full = media?.source_url || null;
            } catch (e) {}

            return {
              id: item.id,
              date: item.date_gmt,
              featured_image,
              featured_image_full,
              title: item.title.rendered,
              url: item.link,
              content: item.content?.rendered || '',
              excerpt: item.excerpt?.rendered || '',
            };
          })
        );
      })
      .catch((error) => {
        console.error('Failed to fetch news:', error);
      });
  };

  useAsyncEffect(async () => {
    await fetchEntries();
    setLoading(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // Don't clear entries — keep showing old data while refreshing so the screen
    // doesn't go blank. Data replaces once fetch completes.
    fetchEntries().then(() => setRefreshing(false));
  }, []);

  return (
    <Wrapper>
      <Topbar>
        <TopbarColumn stretch>
          <TopbarText>Latest News</TopbarText>
        </TopbarColumn>
      </Topbar>
      {loading && <Loading />}
      {!loading && entries.length > 0 && (
        <View
          style={{
            marginTop: -8,
            flex: 1,
            backgroundColor: '#f0f4f8',
          }}
        >
          <FlashList
            data={entries as ReadonlyArray<EntryType>}
            renderItem={({ item, index }) => (
              <Entry key={item.id} entry={item} isFirst={index === 0} />
            )}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onRefresh}
                tintColor={config.secondary}
                colors={[config.secondary]}
              />
            }
            estimatedItemSize={260}
            keyExtractor={(item) => item.id.toString()}
            ListHeaderComponent={
              refreshing ? <RefreshBanner /> : <View style={{ height: 12 }} />
            }
            ListFooterComponent={
              <View style={{ height: 80 }} />
            }
            showsVerticalScrollIndicator={false}
          />
        </View>
      )}
    </Wrapper>
  );
}
