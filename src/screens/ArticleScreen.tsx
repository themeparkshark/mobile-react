import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import { decode } from 'html-entities';
import { useContext } from 'react';
import {
  Dimensions,
  Platform,
  ScrollView,
  Share,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import RenderHtml from 'react-native-render-html';
import config from '../config';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import dayjs from '../helpers/dayjs';

const tapSound = require('../../assets/sounds/tap.mp3');
const { width: SCREEN_WIDTH } = Dimensions.get('window');

const htmlTagStyles = {
  body: {
    fontFamily: 'Knockout',
    fontSize: 16,
    lineHeight: 26,
    color: '#2d3436',
  },
  p: {
    marginBottom: 16,
  },
  h2: {
    fontFamily: 'Shark',
    fontSize: 22,
    color: '#1a1a2e',
    marginTop: 24,
    marginBottom: 8,
  },
  h3: {
    fontFamily: 'Shark',
    fontSize: 19,
    color: '#1a1a2e',
    marginTop: 20,
    marginBottom: 6,
  },
  a: {
    color: config.secondary,
    textDecorationLine: 'none' as const,
  },
  img: {
    borderRadius: 12,
    marginVertical: 12,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: config.secondary,
    paddingLeft: 16,
    marginLeft: 0,
    fontStyle: 'italic' as const,
    color: '#636e72',
  },
  figcaption: {
    fontSize: 13,
    color: '#999',
    textAlign: 'center' as const,
    marginTop: -8,
    marginBottom: 16,
  },
  li: {
    marginBottom: 6,
  },
};

export default function ArticleScreen({ route, navigation }: any) {
  const { entry } = route.params;
  const { playSound } = useContext(SoundEffectContext);

  const date = dayjs(entry.date).format('MMMM D, YYYY');

  const onShare = async () => {
    playSound(tapSound);
    await Share.share({
      message: `${decode(entry.title)} ${entry.url}`,
      url: entry.url,
    });
  };

  const openInBrowser = () => {
    playSound(tapSound);
    WebBrowser.openBrowserAsync(entry.url);
  };

  const heroImage = entry.featured_image_full || entry.featured_image;

  return (
    <View style={{ flex: 1, backgroundColor: 'white' }}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 60 }}
      >
        {/* Hero image */}
        <View style={{ position: 'relative' }}>
          {heroImage ? (
            <Image
              source={heroImage}
              style={{
                width: SCREEN_WIDTH,
                height: 260,
              }}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <LinearGradient
              colors={[config.primary, config.secondary]}
              style={{
                width: SCREEN_WIDTH,
                height: 260,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 60 }}>🦈</Text>
            </LinearGradient>
          )}

          {/* Gradient overlay on image */}
          <LinearGradient
            colors={['rgba(0,0,0,0.3)', 'transparent', 'rgba(0,0,0,0.4)']}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
            }}
          />

          {/* Back button */}
          <TouchableOpacity
            onPress={() => {
              playSound(tapSound);
              navigation.goBack();
            }}
            activeOpacity={0.7}
            style={{
              position: 'absolute',
              top: Platform.OS === 'ios' ? 54 : 16,
              left: 16,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(0,0,0,0.4)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontSize: 20, marginTop: -2 }}>‹</Text>
          </TouchableOpacity>

          {/* Share button */}
          <TouchableOpacity
            onPress={onShare}
            activeOpacity={0.7}
            style={{
              position: 'absolute',
              top: Platform.OS === 'ios' ? 54 : 16,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: 'rgba(0,0,0,0.4)',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text style={{ color: 'white', fontSize: 18 }}>↗</Text>
          </TouchableOpacity>
        </View>

        {/* Article content card */}
        <View
          style={{
            marginTop: -24,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: 'white',
            paddingTop: 24,
            paddingHorizontal: 20,
          }}
        >
          {/* Date */}
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 13,
              color: config.secondary,
              textTransform: 'uppercase',
              letterSpacing: 1,
              marginBottom: 8,
            }}
          >
            {date}
          </Text>

          {/* Title */}
          <Text
            style={{
              fontFamily: 'Shark',
              fontSize: 26,
              color: '#1a1a2e',
              lineHeight: 32,
              marginBottom: 20,
            }}
          >
            {decode(entry.title)}
          </Text>

          {/* Divider */}
          <View
            style={{
              height: 3,
              borderRadius: 1.5,
              backgroundColor: config.secondary,
              width: 50,
              marginBottom: 20,
            }}
          />

          {/* Article HTML content */}
          {entry.content ? (
            <RenderHtml
              contentWidth={SCREEN_WIDTH - 40}
              source={{ html: entry.content }}
              tagsStyles={htmlTagStyles}
              enableExperimentalMarginCollapsing
              renderersProps={{
                a: {
                  onPress: (_: any, href: string) => {
                    WebBrowser.openBrowserAsync(href);
                  },
                },
                img: {
                  enableExperimentalPercentWidth: true,
                },
              }}
            />
          ) : (
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 16,
                color: '#636e72',
                lineHeight: 24,
              }}
            >
              Tap below to read the full article.
            </Text>
          )}

          {/* Open in browser button */}
          <TouchableOpacity
            onPress={openInBrowser}
            activeOpacity={0.8}
            style={{ marginTop: 24, borderRadius: 16, overflow: 'hidden' }}
          >
            <LinearGradient
              colors={[config.secondary, '#0080cc']}
              style={{
                paddingVertical: 14,
                alignItems: 'center',
                borderRadius: 16,
              }}
            >
              <Text
                style={{
                  fontFamily: 'Shark',
                  fontSize: 16,
                  color: 'white',
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                View on Website
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
