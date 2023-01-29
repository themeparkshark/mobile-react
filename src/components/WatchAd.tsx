import { TestIds, useInterstitialAd } from 'react-native-google-mobile-ads';
import { useEffect } from 'react';
import Button from './Button';
import { Image } from 'expo-image';
import * as Animatable from 'react-native-animatable';

export default function WatchAd({ onClose }: { readonly onClose: () => void }) {
  const { isLoaded, isClosed, load, show } = useInterstitialAd(
    __DEV__ ? TestIds.INTERSTITIAL : 'ca-app-pub-3563490411426795/2357294352',
    {
      requestNonPersonalizedAdsOnly: true,
    }
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (isClosed) {
      onClose();
    }
  }, [isClosed]);

  if (isClosed || !isLoaded) {
    return <></>;
  }

  return (
    <Animatable.View
      animation="pulse"
      iterationCount="infinite"
      direction="alternate"
    >
      <Button
        onPress={() => {
          show();
        }}
      >
        <Image
          source={require('../../assets/images/screens/explore/watch.png')}
          style={{
            width: '100%',
            height: 20,
          }}
          contentFit="contain"
        />
      </Button>
    </Animatable.View>
  );
}
