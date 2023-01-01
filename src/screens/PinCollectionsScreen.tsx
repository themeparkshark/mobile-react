import Topbar from '../components/Topbar';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  View,
} from 'react-native';
import all from '../api/endpoints/pin-collections/all';
import { useCallback, useEffect, useState } from 'react';
import PinCollectionModal from '../components/PinCollectionModal';
import { PinCollectionType } from '../models/pin-collection-type';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import { PinType } from '../models/pin-type';
import Loading from '../components/Loading';

export default function PinCollectionsScreen() {
  const [collections, setCollections] = useState<PinCollectionType[]>();
  const [loading, setLoading] = useState<boolean>(true);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Pin Collections screen.');
    }, [])
  );

  useEffect(() => {
    all().then((response) => {
      setCollections(response);
      setLoading(false);
    });
  }, []);

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
              paddingTop: 8,
            }}
            source={require('../../assets/images/water_background.png')}
          >
            <View>
              <View
                style={{
                  height: 300,
                }}
              >
                <Image
                  source={require('../../assets/images/screens/pin-collections/shark.png')}
                  style={{
                    width: Dimensions.get('window').width - 25,
                    height: '100%',
                    resizeMode: 'contain',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}
                />
              </View>
              <View
                style={{
                  paddingTop: 0,
                  paddingLeft: 16,
                  paddingRight: 16,
                  paddingBottom: 48,
                  backgroundColor: 'rgba(255, 255, 255, .6)',
                  borderTopWidth: 5,
                  borderTopColor: '#fff',
                  height: '100%',
                }}
              >
                <View
                  style={{
                    flex: 1,
                  }}
                >
                  {collections && (
                    <FlatList
                      style={{
                        flex: 1,
                        padding: 4,
                      }}
                      data={collections}
                      keyExtractor={(pinCollection) => pinCollection.name}
                      renderItem={({ item }) => (
                        <PinCollectionModal pinCollection={item} />
                      )}
                      numColumns={3}
                    />
                  )}
                </View>
              </View>
            </View>
          </ImageBackground>
        </View>
      )}
    </>
  );
}
