import { SafeAreaView, View, Pressable, Image, ScrollView, Text } from 'react-native';
import { useEffect, useState } from 'react';
import Playercard from '../components/Playercard';
import getInventory from '../api/endpoints/me/inventory';
import getItemTypes from '../api/endpoints/item-types/item-types';
import getItems from '../api/endpoints/me/inventory/items';
import updateInventory from '../api/endpoints/me/inventory/update-inventory';

export default function InventoryScreen() {
  const [inventory, setInventory] = useState(null);
  const [itemTypes, setItemTypes] = useState(null);
  const [currentItemType, setCurrentItemType] = useState(null);
  const [items, setItems] = useState(null);

  useEffect(() => {
    getInventory().then((response) => {
      setInventory(response);
    });
    getItemTypes().then((response) => {
      setItemTypes(response)
      setCurrentItemType(response[0]);
      getItems(response[0].id).then((response) => setItems(response));
    });
  }, []);

  return (
    <SafeAreaView
      style={{
        flex: 1,
      }}
    >
      <View
        style={{
          height: 400,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Playercard
          inventory={inventory}
          style={{
            position: 'absolute',
            marginTop: -70,
          }}
        />
        <ScrollView
          style={{
            position: 'absolute',
            width: '100%',
            bottom: 0,
            borderColor: 'white',
            borderType: 'solid',
            borderTopWidth: 4,
            borderBottomWidth: 4,
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
                  borderColor: 'grey',
                  borderRightWidth: key === itemTypes.length - 1 ? 0 : 1,
                  backgroundColor: itemType.id === currentItemType?.id
                    ? 'rgba(240, 255, 0, .9)'
                    : 'rgba(255, 255, 255, .9)',
                }}
              >
                <Pressable
                  onPress={() => {
                    setCurrentItemType(itemType);
                    getItems(itemType.id).then((response) => setItems(response));
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
            )
          })}
        </ScrollView>
      </View>
      { inventory && (
        <ScrollView
          style={{
            flex: 1,
            padding: 24,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
            }}
          >
            {items?.map((item) => {
              return (
                <View
                  key={item.id}
                  style={{
                    padding: 4,
                    width: '33.333%',
                  }}
                >
                  <Pressable
                    style={{
                      padding: 16,
                      backgroundColor: 'green',
                      borderType: 'solid',
                      borderWidth: 6,
                      borderColor: 'white',
                      borderRadius: 10,
                    }}
                    onPress={() => {
                      updateInventory(item).then((response) => setInventory(response));
                    }}
                  >
                    <Text>
                      {item.name}
                    </Text>
                    <Text>
                      { Object.values(inventory).map(function (inventoryItem) {
                        return inventoryItem?.id;
                      }).includes(item.id) ? 'Yes' : 'No' }
                    </Text>
                  </Pressable>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}
