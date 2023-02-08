import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import {View, ImageBackground} from 'react-native';
import getPinSwaps from '../api/endpoints/pin-swaps/all';
import PinSwap from '../components/PinSwap';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { PinSwapType } from '../models/pin-swap-type';
import Loading from '../components/Loading';
import {useAsyncEffect} from 'rooks';

export default function PinSwapsScreen() {
  const [pinSwaps, setPinSwaps] = useState<PinSwapType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);

  useAsyncEffect(async () => {
    setLoading(true);
    setPinSwaps(await getPinSwaps());
    setLoading(false);
  }, []);

  return (
    <Wrapper>
      <Topbar text="Trading Board" showBackButton />
      <View
        style={{
          marginTop: -8,
          flex: 1,
        }}
      >
        <ImageBackground
          source={require('../../assets/images/screens/pin-swaps/corkboard.png')}
          style={{
            width: '100%',
            height: '100%',
          }}
        >
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
            }}
          >
            {loading && <Loading />}
            {!loading && (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                }}
              >
                {pinSwaps.map((pinSwap) => {
                  return (
                    <View
                      key={pinSwap.id}
                      style={{
                        width: '33.3333333%',
                      }}
                    >
                      <PinSwap
                        pinSwap={pinSwap}
                        onClose={async () => {
                          setPinSwaps(await getPinSwaps());
                        }}
                      />
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ImageBackground>
      </View>
    </Wrapper>
  );
}
