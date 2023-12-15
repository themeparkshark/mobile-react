import { Image } from 'expo-image';
import { useContext, useEffect, useState } from 'react';
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
import InformationModal from '../components/InformationModal';
import Loading from '../components/Loading';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import { AuthContext } from '../context/AuthProvider';
import { CurrencyContext } from '../context/CurrencyProvider';
import useCrumbs from '../hooks/useCrumbs';
import { CatalogType } from '../models/catalog-type';
import { InformationModalEnums } from '../models/information-modal-enums';
import { ItemType } from '../models/item-type';
import { StoreType } from '../models/store-type';
import Section from './StoreScreen/Section';

export default function StoreScreen({ route }) {
  const { store } = route.params;
  const [currentStore, setCurrentStore] = useState<StoreType>();
  const [catalog, setCatalog] = useState<CatalogType>();
  const [weeklyItems, setWeeklyItems] = useState<ItemType[]>();
  const [monthlyItems, setMonthlyItems] = useState<ItemType[]>();
  const [items, setItems] = useState<ItemType[]>();
  const [loading, setLoading] = useState<boolean>(true);
  const { player } = useContext(AuthContext);
  const { labels } = useCrumbs();
  const { currencies } = useContext(CurrencyContext);

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
      <Topbar purple={currentStore?.is_secret_store ?? false}>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>{currentStore?.name}</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false}>
          <InformationModal id={InformationModalEnums.StoreScreen} />
        </TopbarColumn>
      </Topbar>
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
                    source={{
                      uri: currencies[0].icon_url,
                    }}
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
                    {vsprintf(labels.coins, [player.coins])}
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
