import { TestIds, useInterstitialAd } from 'react-native-google-mobile-ads';
import { useEffect } from 'react';
import Button from './Button';
import { Image } from 'react-native';
import * as Animatable from 'react-native-animatable';

export default function WatchAd({ onClose }: { readonly onClose: () => void }) {
  const { isClosed, load, show } = useInterstitialAd(
    __DEV__ ? TestIds.INTERSTITIAL : 'ca-app-pub-3563490411426795~6359856531',
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

  if (isClosed || !load) {
    return <></>;
  }

  return (
    <Animatable.View
      animation="pulse"
      iterationCount="infinite"
      direction="alternate"
    >
      <Button onPress={() => show()}>
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
