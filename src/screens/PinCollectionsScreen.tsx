import Topbar from '../components/Topbar';
import {
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  View,
} from 'react-native';
import all from '../api/endpoints/pin-collections/all';
import { useEffect, useState } from 'react';
import PinCollectionModal from '../components/PinCollectionModal';
import { PinCollectionType } from '../models/pin-collection-type';

export default function PinCollectionsScreen() {
  const [collections, setCollections] = useState<PinCollectionType[]>();

  useEffect(() => {
    all().then((response) => setCollections(response));
  }, []);

  return (
    <>
      <Topbar text={'Pin Packs'} showBackButton={true} />
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
                borderTopStyle: 'solid',
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
                    keyExtractor={(item) => item.id}
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
    </>
  );
}
