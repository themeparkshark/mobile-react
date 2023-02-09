import { useCallback, useState } from 'react';
import {
  ImageBackground,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
import getPinSwaps from '../api/endpoints/pin-swaps/all';
import Loading from '../components/Loading';
import PinSwap from '../components/PinSwap';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { PinSwapType } from '../models/pin-swap-type';

export default function PinSwapsScreen() {
  const [pinSwaps, setPinSwaps] = useState<PinSwapType[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPinSwaps(await getPinSwaps());
    setRefreshing(false);
  }, []);

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
              <ScrollView
                refreshControl={
                  <RefreshControl
                    refreshing={refreshing}
                    onRefresh={onRefresh}
                  />
                }
                contentContainerStyle={{
                  justifyContent: 'center',
                  flexGrow: 1,
                }}
              >
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
              </ScrollView>
            )}
          </View>
        </ImageBackground>
      </View>
    </Wrapper>
  );
}
