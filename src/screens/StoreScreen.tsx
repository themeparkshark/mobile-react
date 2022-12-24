import {
  Dimensions,
  Image,
  ImageBackground,
  ScrollView,
  View,
} from 'react-native';
import getStore from '../api/endpoints/stores/get';
import getCatalog from '../api/endpoints/catalogs/get';
import { useEffect, useState } from 'react';
import Topbar from '../components/Topbar';
import Section from './Store/Section';
import { StoreType } from '../models/store-type';
import { CatalogType } from '../models/catalog-type';
import { ItemType } from '../models/item-type';

export default function StoreScreen({ route }) {
  const { store } = route.params;
  const [currentStore, setCurrentStore] = useState<StoreType>();
  const [catalog, setCatalog] = useState<CatalogType>();
  const [weeklyItems, setWeeklyItems] = useState<ItemType[]>();
  const [monthlyItems, setMonthlyItems] = useState<ItemType[]>();

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
    if (catalog) {
      setWeeklyItems(catalog.items.filter((item) => item.section === 'weekly'));
      setMonthlyItems(
        catalog.items.filter((item) => item.section === 'monthly')
      );
    }
  }, [catalog]);

  return (
    <>
      <Topbar
        showBackButton={true}
        showCoins={true}
        text={currentStore?.name}
      />
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
              <Section title="Weekly Items" items={monthlyItems} />
            )}
          </ScrollView>
        </ImageBackground>
      </View>
    </>
  );
}
