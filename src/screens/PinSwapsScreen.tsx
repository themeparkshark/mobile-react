import { useFocusEffect } from '@react-navigation/native';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import recordActivity from '../api/endpoints/activities/create';
import getPinSwaps from '../api/endpoints/pin-swaps/all';
import Loading from '../components/Loading';
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
        <ScrollView
          style={{
            marginTop: -8,
          }}
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
                renderItem={({ item }) => <Text>{item.id}</Text>}
                estimatedItemSize={15}
                keyExtractor={(item) => item.id.toString()}
                onEndReached={() => {
                  setPage((prevState) => prevState + 1);
                }}
              />
            )}
            {!pinSwaps.length && !refreshing && (
              <Text
                style={{
                  fontSize: 18,
                  fontFamily: 'Knockout',
                  textAlign: 'center',
                }}
              >
                There are no pins available.
              </Text>
            )}
          </View>
        </ScrollView>
      )}
    </Wrapper>
  );
}
