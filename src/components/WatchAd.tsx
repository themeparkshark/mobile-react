import { useEffect } from 'react';
import { View } from 'react-native';
import * as Animatable from 'react-native-animatable';
import { TestIds, useInterstitialAd } from 'react-native-google-mobile-ads';
import RedButton from './RedButton';

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
    return (
      <View
        style={{
          opacity: 0.5,
        }}
      >
        <RedButton
          text="x2 Watch Ad"
          onPress={() => {
            show();
          }}
        />
      </View>
    );
  }

  return (
    <Animatable.View
      animation="pulse"
      iterationCount="infinite"
      direction="alternate"
    >
      <RedButton
        text="X2 WATCH AD"
        onPress={() => {
          show();
        }}
      />
    </Animatable.View>
  );
}
