import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { decode } from 'html-entities';
import { useContext, useRef } from 'react';
import { Animated, Text, TouchableWithoutFeedback, View } from 'react-native';
import * as RootNavigation from '../../RootNavigation';
import config from '../../config';
import { SoundEffectContext } from '../../context/SoundEffectProvider';
import dayjs from '../../helpers/dayjs';
import { EntryType } from '../../models/entry-type';

const tapSound = require('../../../assets/sounds/tap.mp3');

function TimeBadge({ date }: { date: string }) {
  const now = dayjs();
  const published = dayjs(date);
  const hoursAgo = now.diff(published, 'hour');
  const daysAgo = now.diff(published, 'day');

  let label: string;
  let colors: [string, string];

  if (hoursAgo < 1) {
    label = 'JUST NOW';
    colors = ['#ff4444', '#cc0000'];
  } else if (hoursAgo < 24) {
    label = `${hoursAgo}h AGO`;
    colors = [config.secondary, '#0080cc'];
  } else if (daysAgo < 2) {
    label = 'YESTERDAY';
    colors = ['#6c5ce7', '#4834d4'];
  } else if (daysAgo < 7) {
    label = `${daysAgo}d AGO`;
    colors = ['#636e72', '#2d3436'];
  } else {
    label = published.format('MMM D');
    colors = ['#636e72', '#2d3436'];
  }

  return (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 0 }}
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: 'flex-start',
      }}
    >
      <Text
        style={{
          fontFamily: 'Shark',
          fontSize: 11,
          color: 'white',
          letterSpacing: 0.5,
        }}
      >
        {label}
      </Text>
    </LinearGradient>
  );
}

export default function Entry({
  entry,
  isFirst = false,
}: {
  readonly entry: EntryType;
  readonly isFirst?: boolean;
}) {
  const { playSound } = useContext(SoundEffectContext);
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const onPressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };

  const onPress = () => {
    playSound(tapSound);
    RootNavigation.navigate('Article', { entry });
  };

  const imageHeight = isFirst ? 220 : 180;

  return (
    <TouchableWithoutFeedback
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      onPress={onPress}
    >
      <Animated.View
        style={{
          marginHorizontal: 16,
          marginBottom: 16,
          borderRadius: 18,
          overflow: 'hidden',
          backgroundColor: 'white',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.12,
          shadowRadius: 12,
          elevation: 6,
          transform: [{ scale: scaleAnim }],
        }}
      >
        {/* Hero image */}
        <View style={{ position: 'relative' }}>
          {entry.featured_image ? (
            <Image
              source={entry.featured_image}
              style={{
                width: '100%',
                height: imageHeight,
              }}
              contentFit="cover"
              transition={300}
            />
          ) : (
            <LinearGradient
              colors={[config.primary, config.secondary]}
              style={{
                width: '100%',
                height: imageHeight,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 40 }}>🦈</Text>
            </LinearGradient>
          )}

          {/* Gradient fade at bottom of image */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.5)']}
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              height: 60,
            }}
          />

          {/* Time badge overlaying image */}
          <View style={{ position: 'absolute', top: 12, left: 12 }}>
            <TimeBadge date={entry.date} />
          </View>
        </View>

        {/* Content area */}
        <View
          style={{
            padding: 16,
            paddingTop: 14,
          }}
        >
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: isFirst ? 20 : 17,
              color: '#1a1a2e',
              lineHeight: isFirst ? 26 : 22,
            }}
            numberOfLines={3}
          >
            {decode(entry.title)}
          </Text>

          {/* Read more hint */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 10,
            }}
          >
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 13,
                color: config.secondary,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}
            >
              Read Article
            </Text>
            <Text
              style={{
                color: config.secondary,
                fontSize: 13,
                marginLeft: 4,
              }}
            >
              →
            </Text>
          </View>
        </View>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
}
