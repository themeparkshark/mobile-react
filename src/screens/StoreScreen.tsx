import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Dimensions, ImageBackground, ScrollView, View } from 'react-native';
import getCatalog from '../api/endpoints/catalogs/get';
import getStore from '../api/endpoints/stores/get';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import { MusicContext } from '../context/MusicProvider';
import { CatalogType } from '../models/catalog-type';
import { ItemType } from '../models/item-type';
import { StoreType } from '../models/store-type';
import Section from './Store/Section';

export default function StoreScreen({ route }) {
  const { store } = route.params;
  const [currentStore, setCurrentStore] = useState<StoreType>();
  const [catalog, setCatalog] = useState<CatalogType>();
  const [weeklyItems, setWeeklyItems] = useState<ItemType[]>();
  const [monthlyItems, setMonthlyItems] = useState<ItemType[]>();
  const [items, setItems] = useState<ItemType[]>();
  const [loading, setLoading] = useState<boolean>(true);
  const { playMusic } = useContext(MusicContext);

  useFocusEffect(
    useCallback(() => {
      playMusic(require('../../assets/sounds/music/track3.mp3'));
    }, [])
  );

  useEffect(() => {
    getStore(store).then((response) => setCurrentStore(response));
  }, []);

  useEffect(() => {
    if (currentStore) {
      getCatalog(currentStore.current_catalog_id).then((response) =>
        setCatalog(response)
      );
    }
  }, [currentStore?.id]);

  useEffect(() => {
    if (catalog && currentStore) {
      setWeeklyItems(catalog.items.filter((item) => item.section === 'weekly'));
      setMonthlyItems(
        catalog.items.filter((item) => item.section === 'monthly')
      );
      setItems(catalog.items.filter((item) => !item.section));

      setLoading(false);
    }
  }, [catalog]);

  return (
    <>
      <Topbar
        purple={currentStore?.is_secret_store ?? false}
        showBackButton={true}
        showCoins={true}
        text={currentStore?.name}
      />
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
            source={{
              uri: currentStore?.background_url,
            }}
          >
            <ScrollView
              style={{
                paddingTop: 8,
              }}
            >
              <View
                style={{
                  height: 300,
                }}
              >
                <Image
                  source={catalog?.promotion_image_url}
                  style={{
                    width: Dimensions.get('window').width - 25,
                    height: '100%',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}
                  contentFit="contain"
                />
              </View>
              {weeklyItems.length > 0 && (
                <Section title="Weekly Items" items={weeklyItems} />
              )}
              {monthlyItems.length > 0 && (
                <Section title="Monthly Items" items={monthlyItems} />
              )}
              {items.length > 0 && <Section title="Items" items={items} />}
            </ScrollView>
          </ImageBackground>
        </View>
      )}
    </>
  );
}
