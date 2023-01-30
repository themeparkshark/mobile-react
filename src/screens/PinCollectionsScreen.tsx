import Topbar from '../components/Topbar';
import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  ScrollView,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import all from '../api/endpoints/pin-collections/all';
import { useCallback, useEffect, useState } from 'react';
import PinCollectionModal from '../components/PinCollectionModal';
import { PinCollectionType } from '../models/pin-collection-type';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import Loading from '../components/Loading';
import { FlashList } from '@shopify/flash-list';
import { useAsyncEffect } from 'rooks';

export default function PinCollectionsScreen() {
  const [collections, setCollections] = useState<PinCollectionType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [collectionsLoading, setCollectionsLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);

  const requestCollections = async (page: number) => {
    const response = await all(page);
    setCollections((prevState) => [...prevState, ...response]);
    setCollectionsLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Pin Collections screen.');
    }, [])
  );

  useAsyncEffect(async () => {
    await requestCollections(page);

    if (page === 1) {
      setLoading(false);
    }
  }, [page]);

  return (
    <>
      <Topbar text={'Pin Packs'} showBackButton={true} />
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
            <ScrollView>
              <View
                style={{
                  height: 300,
                  borderBottomWidth: 5,
                  borderBottomColor: '#fff',
                }}
              >
                <Image
                  source={require('../../assets/images/screens/pin-collections/shark.png')}
                  style={{
                    width: Dimensions.get('window').width - 25,
                    height: '100%',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}
                  contentFit="contain"
                />
              </View>
              {collections && (
                <View
                  style={{
                    flex: 1,
                    paddingLeft: 4,
                    paddingRight: 4,
                    backgroundColor: 'rgba(255, 255, 255, .6)',
                  }}
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
                        color="rgba(0, 0, 0, .5)"
                      />
                    </View>
                  )}
                  {!collectionsLoading && (
                    <FlashList
                      contentContainerStyle={{ paddingBottom: 8 }}
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
                </View>
              )}
            </ScrollView>
          </ImageBackground>
        </View>
      )}
    </>
  );
}
