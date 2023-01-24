import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  ImageBackground,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import { useContext, useEffect, useState, useRef, useCallback } from 'react';
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

export default function InventoryScreen() {
  const [itemTypes, setItemTypes] = useState<ItemTypeType[]>();
  const [currentItemType, setCurrentItemType] = useState<ItemTypeType>();
  const [items, setItems] = useState<ItemType[]>();
  const { inventory } = useContext(AuthContext);
  const flatListRef = useRef();
  const [loading, setLoading] = useState<boolean>(true);
  const { refreshUser } = useContext(AuthContext);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Inventory screen.');
    }, [])
  );

  useEffect(() => {
    getItemTypes().then((response) => {
      setItemTypes(response);
      setCurrentItemType(response[0]);
      getItems(response[0].id).then((response) => {
        setItems(response);
        setLoading(false);
      });
    });
  }, []);

  return (
    <>
      <Topbar
        onBackButtonPress={() => refreshUser()}
        showBackButton={true}
        text="Inventory"
      />
      {loading && <Loading />}
      {!loading && (
        <>
          <View
            style={{
              marginTop: -8,
              height: 400,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            {inventory && (
              <Playercard
                inventory={inventory}
                style={{
                  position: 'absolute',
                  width: Dimensions.get('window').width,
                  height: 460,
                  marginTop: -50,
                }}
              />
            )}
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
              {itemTypes?.map((itemType, key) => {
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
                        await getItems(itemType.id).then((response) =>
                          setItems(response)
                        );
                        setCurrentItemType(itemType);
                        flatListRef.current.scrollToOffset({
                          animated: true,
                          offset: 0,
                        });
                      }}
                    >
                      <Image
                        style={{
                          width: 60,
                          height: 60,
                          resizeMode: 'contain',
                        }}
                        source={{
                          uri: itemType.image_url,
                        }}
                      />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          </View>
          {inventory && currentItemType && (
            <ImageBackground
              source={require('../../assets/images/shark_background.png')}
              resizeMode={'cover'}
              style={{
                width: '100%',
                flex: 1,
              }}
            >
              <FlatList
                ref={flatListRef}
                style={{
                  flex: 1,
                  padding: 4,
                }}
                contentContainerStyle={{ paddingBottom: 8 }}
                data={items}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => (
                  <Item item={item} currentItemType={currentItemType} />
                )}
                numColumns={3}
              />
            </ImageBackground>
          )}
        </>
      )}
    </>
  );
}
