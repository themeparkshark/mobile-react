import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  ScrollView,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import getStore from '../api/endpoints/stores/get';
import getCatalog from '../api/endpoints/catalogs/get';
import { useCallback, useContext, useEffect, useState } from 'react';
import Topbar from '../components/Topbar';
import Section from './Store/Section';
import { StoreType } from '../models/store-type';
import { CatalogType } from '../models/catalog-type';
import { ItemType } from '../models/item-type';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import { MusicContext } from '../context/MusicProvider';
import Loading from '../components/Loading';

export default function StoreScreen({ route }) {
  const { store } = route.params;
  const [currentStore, setCurrentStore] = useState<StoreType>();
  const [catalog, setCatalog] = useState<CatalogType>();
  const [weeklyItems, setWeeklyItems] = useState<ItemType[]>();
  const [monthlyItems, setMonthlyItems] = useState<ItemType[]>();
  const [items, setItems] = useState<ItemType[]>();
  const [loading, setLoading] = useState<boolean>(true);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Store screen.');
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
      if (!currentStore.is_secret_store) {
        setWeeklyItems(
          catalog.items.filter((item) => item.section === 'weekly')
        );
        setMonthlyItems(
          catalog.items.filter((item) => item.section === 'monthly')
        );
      } else {
        setItems(catalog.items);
      }

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
                  source={{
                    uri: catalog?.promotion_image_url,
                  }}
                  style={{
                    width: Dimensions.get('window').width - 25,
                    height: '100%',
                    resizeMode: 'contain',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}
                />
              </View>
              {weeklyItems && (
                <Section title="Weekly Items" items={weeklyItems} />
              )}
              {monthlyItems && (
                <Section title="Monthly Items" items={monthlyItems} />
              )}
              {items && <Section title="Items" items={items} />}
            </ScrollView>
          </ImageBackground>
        </View>
      )}
    </>
  );
}
