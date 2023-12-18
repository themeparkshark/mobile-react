import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  SafeAreaView,
  Text,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
import getCatalog from '../api/endpoints/catalogs/get';
import getItems from '../api/endpoints/catalogs/items';
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
import Item from './StoreScreen/Item';

export default function StoreScreen({ route }) {
  const { store } = route.params;
  const [currentStore, setCurrentStore] = useState<StoreType>();
  const [catalog, setCatalog] = useState<CatalogType>();
  const [items, setItems] = useState<ItemType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { player } = useContext(AuthContext);
  const { labels } = useCrumbs();
  const { currencies } = useContext(CurrencyContext);
  const [page, setPage] = useState<number>(1);

  const fetchItems = async (page: number) => {
    if (!catalog) {
      return;
    }

    const response = await getItems(catalog.id, page);
    setItems((prevState) => {
      return [...prevState, ...response];
    });
  };

  useAsyncEffect(async () => {
    setCurrentStore(await getStore(store));
  }, []);

  useAsyncEffect(async () => {
    if (!currentStore) {
      return;
    }

    setCatalog(await getCatalog(currentStore.current_catalog_id));
  }, [currentStore?.id]);

  useAsyncEffect(async () => {
    if (!catalog) {
      return;
    }

    await fetchItems(page);
    setLoading(false);
  }, [catalog]);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchItems(page);
    }
  }, [page]);

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
        <ImageBackground
          style={{
            flex: 1,
            marginTop: -8,
          }}
          source={{
            uri: currentStore?.background_url,
          }}
        >
          <SafeAreaView
            style={{
              flex: 1,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                columnGap: 16,
                justifyContent: 'center',
                paddingTop: 16,
              }}
            >
              {catalog &&
                catalog.currencies.map((currency) => {
                  return (
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
                      }}
                    >
                      <Image
                        source={{
                          uri: currency.icon_url,
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
                            width: 1,
                            height: 1,
                          },
                          textShadowRadius: 0,
                          fontFamily: 'Knockout',
                          fontSize: 18,
                          marginLeft: 8,
                        }}
                      >
                        {player[currency.name.toLowerCase()]} {currency.name}
                      </Text>
                    </View>
                  );
                })}
            </View>
            <View
              style={{
                height: 180,
                paddingTop: 16,
                paddingBottom: 16,
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
            {items && items?.length > 0 && (
              <View
                style={{
                  borderTopWidth: 5,
                  borderTopColor: '#fff',
                  flex: 1,
                }}
              >
                <FlashList
                  data={items as ReadonlyArray<ItemType[]>}
                  contentContainerStyle={{
                    padding: 8,
                    backgroundColor: 'rgba(255, 255, 255, .6)',
                  }}
                  numColumns={3}
                  renderItem={({ item }) => (
                    <View style={{ padding: 8, flex: 1 }}>
                      <Item item={item as ItemType} />
                    </View>
                  )}
                  estimatedItemSize={80}
                  keyExtractor={(item) => item.id}
                  onEndReached={() => {
                    setPage((prevState) => prevState + 1);
                  }}
                />
              </View>
            )}
          </SafeAreaView>
        </ImageBackground>
      )}
    </>
  );
}
