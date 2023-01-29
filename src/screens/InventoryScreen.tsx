import {
  ActivityIndicator,
  Dimensions,
  ImageBackground,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useContext, useEffect, useState, useCallback } from 'react';
import Playercard from '../components/Playercard';
import getItemTypes from '../api/endpoints/item-types/item-types';
import getItems from '../api/endpoints/me/inventory/items';
import Topbar from '../components/Topbar';
import { AuthContext } from '../context/AuthProvider';
import Item from '../components/Item';
import { ItemTypeType } from '../models/item-type-type';
import { ItemType } from '../models/item-type';
import { useFocusEffect } from '@react-navigation/native';
import recordActivity from '../api/endpoints/activities/create';
import Loading from '../components/Loading';
import { FlashList } from '@shopify/flash-list';
import { SoundEffectContext } from '../context/SoundEffectProvider';

export default function InventoryScreen() {
  const [itemTypes, setItemTypes] = useState<ItemTypeType[]>([]);
  const [currentItemType, setCurrentItemType] = useState<ItemTypeType>();
  const [items, setItems] = useState<ItemType[]>([]);
  const { inventory } = useContext(AuthContext);
  const [loading, setLoading] = useState<boolean>(true);
  const [itemsLoading, setItemsLoading] = useState<boolean>(true);
  const { refreshUser } = useContext(AuthContext);
  const [page, setPage] = useState<number>(1);
  const { playSound } = useContext(SoundEffectContext);

  const requestItems = async (page: number) => {
    if (!currentItemType) {
      return;
    }

    const response = await getItems(currentItemType.id, page);
    setItems((prevState) => {
      return [...prevState, ...response];
    });
    setItemsLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Inventory screen.');
    }, [])
  );

  useEffect(() => {
    (async () => {
      const response = await getItemTypes();
      setItemTypes(response);
      setCurrentItemType(response[0]);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (currentItemType) {
        await requestItems(page);
        setLoading(false);
      }
    })();
  }, [currentItemType]);

  useEffect(() => {
    if (page > 1) {
      (async () => {
        await requestItems(page);
      })();
    }
  }, [page]);

  return (
    <>
      <Topbar
        onBackButtonPress={async () => {
          await refreshUser();
        }}
        showBackButton={true}
        text="Inventory"
      />
      {loading && <Loading />}
      {!loading && inventory && itemTypes && currentItemType && (
        <>
          <View
            style={{
              marginTop: -8,
              height: 400,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Playercard
              inventory={inventory}
              style={{
                position: 'absolute',
                width: Dimensions.get('window').width,
                height: 460,
                marginTop: -50,
              }}
            />
            <ScrollView
              style={{
                position: 'absolute',
                width: '100%',
                bottom: 0,
                borderColor: 'white',
                borderTopWidth: 6,
                borderBottomWidth: 6,
              }}
              horizontal={true}
            >
              {itemTypes.map((itemType, key) => {
                return (
                  <View
                    key={itemType.id}
                    style={{
                      paddingLeft: 8,
                      paddingRight: 8,
                      borderColor: 'white',
                      borderRightWidth: key === itemTypes.length - 1 ? 0 : 1,
                      backgroundColor:
                        itemType.id === currentItemType?.id
                          ? 'rgba(255, 255, 255, .9)'
                          : 'rgba(255, 255, 255, .6)',
                    }}
                  >
                    <Pressable
                      onPress={async () => {
                        if (itemType.id === currentItemType.id) {
                          return;
                        }

                        playSound(
                          require('../../assets/sounds/inventory_item_type_tap.mp3')
                        );

                        setItemsLoading(true);
                        setCurrentItemType(itemType);
                        setItems([]);
                        setPage(1);
                      }}
                    >
                      <Image
                        style={{
                          width: 60,
                          height: 60,
                        }}
                        source={itemType.image_url}
                        contentFit="contain"
                      />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
          <ImageBackground
            source={require('../../assets/images/shark_background.png')}
            resizeMode="cover"
            style={{
              width: '100%',
              flex: 1,
            }}
          >
            <View
              style={{
                flex: 1,
                paddingLeft: 4,
                paddingRight: 4,
              }}
            >
              {itemsLoading && (
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ActivityIndicator size="large" color="rgba(0, 0, 0, .5)" />
                </View>
              )}
              {!itemsLoading && (
                <FlashList
                  data={items}
                  renderItem={({ item }) => (
                    <Item item={item} currentItemType={currentItemType} />
                  )}
                  estimatedItemSize={15}
                  keyExtractor={(item) => item.id.toString()}
                  numColumns={3}
                  onEndReached={() => {
                    setPage((prevState) => prevState + 1);
                  }}
                />
              )}
            </View>
          </ImageBackground>
        </>
      )}
    </>
  );
}
