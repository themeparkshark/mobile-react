import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useState } from 'react';
import {
  ImageBackground,
  RefreshControl,
  ScrollView,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
import recordActivity from '../api/endpoints/activities/create';
import getPinSwaps from '../api/endpoints/pin-swaps/all';
import Loading from '../components/Loading';
import PinSwap from '../components/PinSwap';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import { PinSwapType } from '../models/pin-swap-type';

export default function PinSwapsScreen() {
  const [pinSwaps, setPinSwaps] = useState<PinSwapType[]>([]);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Pin Swaps screen.');
    }, [])
  );

  const fetchPinSwaps = async (page: number) => {
    const response = await getPinSwaps(page);
    setPinSwaps((prevState) => {
      return [...prevState, ...response];
    });
  };

  useEffect(() => {
    fetchPinSwaps(page).then(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setPinSwaps([]);
    fetchPinSwaps(1).then(() => setRefreshing(false));
    setPage(1);
  }, []);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchPinSwaps(page);
    }
  }, [page]);

  return (
    <Wrapper>
      <Topbar text="Trading Board" showBackButton />
      {loading && <Loading />}
      {!loading && (
        <ImageBackground
          source={require('../../assets/images/screens/pin-swaps/corkboard.png')}
          style={{
            marginTop: -8,
            width: '100%',
            height: '100%',
          }}
        >
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
            }}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
            }
          >
            <View
              style={{
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 32,
                paddingBottom: 32,
                flex: 1,
              }}
            >
              {!!pinSwaps.length && (
                <FlashList
                  data={pinSwaps}
                  renderItem={({ item }) => (
                    <PinSwap
                      pinSwap={item}
                      onClose={async () => {
                        setPinSwaps(await getPinSwaps(1));
                        setPage(1);
                      }}
                    />
                  )}
                  estimatedItemSize={15}
                  keyExtractor={(item) => item.id.toString()}
                  numColumns={3}
                  onEndReached={() => {
                    setPage((prevState) => prevState + 1);
                  }}
                />
              )}
            </View>
          </ScrollView>
        </ImageBackground>
      )}
    </Wrapper>
  );
}
