import {
  Dimensions,
  FlatList,
  Image,
  ImageBackground,
  Pressable,
  ScrollView,
  View,
} from 'react-native';
import { useContext, useEffect, useState } from 'react';
import Playercard from '../components/Playercard';
import getItemTypes from '../api/endpoints/item-types/item-types';
import getItems from '../api/endpoints/me/inventory/items';
import Topbar from '../components/Topbar';
import { AuthContext } from '../context/AuthProvider';
import Item from '../components/Item';
import { ItemTypeType } from '../models/item-type-type';
import { ItemType } from '../models/item-type';

export default function InventoryScreen() {
  const [itemTypes, setItemTypes] = useState<ItemTypeType[]>();
  const [currentItemType, setCurrentItemType] = useState<ItemTypeType>();
  const [items, setItems] = useState<ItemType[]>();
  const { inventory } = useContext(AuthContext);

  useEffect(() => {
    getItemTypes().then((response) => {
      setItemTypes(response);
      setCurrentItemType(response[0]);
      getItems(response[0].id).then((response) => setItems(response));
    });
  }, []);

  return (
    <>
      <Topbar showBackButton={true} text="Inventory" />
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
            borderType: 'solid',
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
                  borderType: 'solid',
                  borderColor: 'white',
                  borderRightWidth: key === itemTypes.length - 1 ? 0 : 1,
                  backgroundColor:
                    itemType.id === currentItemType?.id
                      ? 'rgba(240, 255, 0, .6)'
                      : 'rgba(255, 255, 255, .6)',
                }}
              >
                <Pressable
                  onPress={async () => {
                    await getItems(itemType.id).then((response) =>
                      setItems(response)
                    );
                    setCurrentItemType(itemType);
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
            style={{
              width: '100%',
              flex: 1,
              resizeMode: 'cover',
            }}
          >
            <FlatList
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
  );
}
