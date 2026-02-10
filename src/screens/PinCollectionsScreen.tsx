import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Easing,
  ImageBackground,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
import all from '../api/endpoints/pin-collections/all';
import Loading from '../components/Loading';
import PinCollectionModal from '../components/PinCollectionModal';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import { PinCollectionType } from '../models/pin-collection-type';

const SCREEN_WIDTH = Dimensions.get('window').width;

// Bubble component
function Bubble({ delay, size, left, duration }: { delay: number; size: number; left: number; duration: number }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const wobble = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startAnimation = () => {
      translateY.setValue(0);
      opacity.setValue(0);

      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -320,
          duration,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(opacity, {
            toValue: 0.6,
            duration: duration * 0.2,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.6,
            duration: duration * 0.5,
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: duration * 0.3,
            useNativeDriver: true,
          }),
        ]),
      ]).start(() => startAnimation());
    };

    // Wobble side to side
    Animated.loop(
      Animated.sequence([
        Animated.timing(wobble, {
          toValue: 8,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(wobble, {
          toValue: -8,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    const timeout = setTimeout(startAnimation, delay);
    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        bottom: 0,
        left: `${left}%`,
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: 'rgba(255,255,255,0.35)',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.5)',
        opacity,
        transform: [{ translateY }, { translateX: wobble }],
      }}
    />
  );
}

const BUBBLES = [
  { delay: 0, size: 10, left: 15, duration: 3500 },
  { delay: 800, size: 7, left: 35, duration: 4000 },
  { delay: 1500, size: 12, left: 55, duration: 3200 },
  { delay: 2200, size: 6, left: 75, duration: 4200 },
  { delay: 600, size: 9, left: 25, duration: 3800 },
  { delay: 1800, size: 8, left: 65, duration: 3600 },
  { delay: 3000, size: 5, left: 45, duration: 4500 },
  { delay: 2800, size: 11, left: 85, duration: 3300 },
];

export default function PinCollectionsScreen() {
  const [collections, setCollections] = useState<PinCollectionType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [collectionsLoading, setCollectionsLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);

  // Shark bobbing animation — perfect symmetric loop
  const bobAnim = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Bob: center → up → center → down → center (symmetric, starts/ends at 0)
    Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, {
          toValue: -8,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bobAnim, {
          toValue: 8,
          duration: 2000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bobAnim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Tilt: center → left → right → center (symmetric, offset from bob)
    Animated.loop(
      Animated.sequence([
        Animated.timing(rotateAnim, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: -1,
          duration: 2400,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(rotateAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const rotate = rotateAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ['-1.5deg', '1.5deg'],
  });

  const requestCollections = async (page: number) => {
    const response = await all(page);
    setCollections((prevState) => [...prevState, ...response]);
    setCollectionsLoading(false);
  };

  useAsyncEffect(async () => {
    await requestCollections(page);

    if (page === 1) {
      setLoading(false);
    }
  }, [page]);

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>Pin Packs</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      {loading && <Loading />}
      {!loading && (
        <View
          style={{
            flex: 1,
            marginTop: -8,
          }}
        >
          <ImageBackground
            style={{
              flex: 1,
            }}
            source={require('../../assets/images/water_background.png')}
          >
            {collectionsLoading && (
              <View
                style={{
                  flex: 1,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ActivityIndicator
                  size="large"
                  color="rgba(255, 255, 255, .7)"
                />
              </View>
            )}
            {!collectionsLoading && (
              <FlashList
                contentContainerStyle={{
                  paddingBottom: 8,
                  paddingLeft: 4,
                  paddingRight: 4,
                  backgroundColor: 'rgba(255, 255, 255, .6)',
                }}
                ListHeaderComponent={
                  <View
                    style={{
                      height: 300,
                      borderBottomWidth: 3,
                      borderBottomColor: 'white',
                      marginLeft: -4,
                      marginRight: -4,
                      backgroundColor: 'transparent',
                      overflow: 'hidden',
                    }}
                  >
                    {/* Bubbles */}
                    {BUBBLES.map((b, i) => (
                      <Bubble key={i} {...b} />
                    ))}
                    {/* Bobbing shark */}
                    <Animated.View
                      style={{
                        flex: 1,
                        transform: [
                          { translateY: bobAnim },
                          { rotate },
                        ],
                      }}
                    >
                      <Image
                        source={require('../../assets/images/screens/pin-collections/shark.png')}
                        style={{
                          width: SCREEN_WIDTH - 25,
                          height: '100%',
                          marginLeft: 'auto',
                          marginRight: 'auto',
                        }}
                        contentFit="contain"
                      />
                    </Animated.View>
                  </View>
                }
                data={collections}
                keyExtractor={(pinCollection) =>
                  pinCollection.id.toString()
                }
                renderItem={({ item }) => (
                  <PinCollectionModal pinCollection={item} />
                )}
                numColumns={3}
                estimatedItemSize={15}
                onEndReached={() => {
                  setPage((prevState) => prevState + 1);
                }}
              />
            )}
          </ImageBackground>
        </View>
      )}
    </>
  );
}
