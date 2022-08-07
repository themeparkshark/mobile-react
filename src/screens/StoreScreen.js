import { ImageBackground, ScrollView, Dimensions, View, Image } from 'react-native';
import getStore from '../api/endpoints/stores/get';
import getCatalog from '../api/endpoints/catalogs/get';
import { useContext, useEffect, useState } from 'react';
import Topbar from '../components/Topbar';
import { ThemeContext } from '../context/ThemeProvider';
import Section from './Store/Section';

export default function StoreScreen({ route }) {
  const { store } = route.params;
  const [currentStore, setCurrentStore] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [weeklyItems, setWeeklyItems] = useState(null);
  const [monthlyItems, setMonthlyItems] = useState(null);
  const { theme } = useContext(ThemeContext);

  useEffect(() => {
    getStore(store).then((response) => setCurrentStore(response));
  }, []);

  useEffect(() => {
    if (currentStore) {
      getCatalog(currentStore.current_catalog_id).then((response) => setCatalog(response));
    }
  }, [currentStore?.id]);

  useEffect(() => {
    if (catalog) {
      setWeeklyItems(catalog.items.filter((item) => item.pivot.section === 'weekly'));
      setMonthlyItems(catalog.items.filter((item) => item.pivot.section === 'monthly'));
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
          source={{
            uri: theme.secondary_background_url,
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
            <Section
              title="Weekly Items"
              items={weeklyItems}
            />
            <Section
              title="Monthly Items"
              items={monthlyItems}
            />
          </ScrollView>
        </ImageBackground>
      </View>
    </>
  );
}
