import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { useCallback, useContext, useEffect, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { vsprintf } from 'sprintf-js';
import getCatalog from '../api/endpoints/catalogs/get';
import getStore from '../api/endpoints/stores/get';
import Loading from '../components/Loading';
import Topbar from '../components/Topbar';
import { AuthContext } from '../context/AuthProvider';
import { MusicContext } from '../context/MusicProvider';
import useCrumbs from '../hooks/useCrumbs';
import { CatalogType } from '../models/catalog-type';
import { InformationModalEnums } from '../models/information-modal-enums';
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
  const { user } = useContext(AuthContext);
  const { labels } = useCrumbs();

  useFocusEffect(
    useCallback(() => {
      if (!currentStore) {
        return;
      }

      playMusic(
        currentStore.is_secret_store
          ? require('../../assets/sounds/music/track4.mp3')
          : require('../../assets/sounds/music/track3.mp3')
      );
    }, [currentStore?.id])
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
        text={currentStore?.name}
        informationModalId={InformationModalEnums.StoreScreen}
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
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                <View
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, .5)',
                    paddingLeft: 12,
                    paddingRight: 12,
                    paddingTop: 6,
                    paddingBottom: 6,
                    borderRadius: 6,
                    borderColor: 'rgba(255, 255, 255, .4)',
                    borderWidth: 2,
                    flexDirection: 'row',
                    alignItems: 'center',
                    margin: 12,
                  }}
                >
                  <Image
                    source={require('../../assets/images/coins.png')}
                    style={{
                      width: 35,
                      height: 35,
                    }}
                    contentFit="contain"
                  />
                  <Text
                    style={{
                      color: '#fff',
                      textShadowColor: 'rgba(0, 0, 0, .5)',
                      textShadowOffset: {
                        width: 2,
                        height: 2,
                      },
                      textShadowRadius: 0,
                      fontFamily: 'Knockout',
                      fontSize: 18,
                      marginLeft: 8,
                    }}
                  >
                    {vsprintf(labels.coins, [user.coins])}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  height: 250,
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
              {!!weeklyItems && weeklyItems.length > 0 && (
                <Section title="Weekly Items" items={weeklyItems} />
              )}
              {!!monthlyItems && monthlyItems.length > 0 && (
                <Section title="Monthly Items" items={monthlyItems} />
              )}
              {!!items && items.length > 0 && (
                <Section title="Items" items={items} />
              )}
            </ScrollView>
          </ImageBackground>
        </View>
      )}
    </>
  );
}
