import { Dimensions, SafeAreaView, ImageBackground, View, Pressable, Text, Image, ScrollView, FlatList } from 'react-native';
import { useContext, useEffect, useState } from 'react';
import Playercard from '../components/Playercard';
import getItemTypes from '../api/endpoints/item-types/item-types';
import getItems from '../api/endpoints/me/inventory/items';
import { ThemeContext } from '../context/ThemeProvider';
import Topbar from '../components/Topbar';
import { AuthContext } from '../context/AuthProvider';
import Item from '../components/Item';

export default function InventoryScreen() {
  const [itemTypes, setItemTypes] = useState(null);
  const [currentItemType, setCurrentItemType] = useState(null);
  const [items, setItems] = useState(null);
  const { theme } = useContext(ThemeContext);
  const { inventory } = useContext(AuthContext);

  useEffect(() => {
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
      <Topbar
        showBackBar={true}
        text="Inventory"
      />
      <View
        style={{
          height: 400,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <Playercard
          style={{
            position: 'absolute',
            width: Dimensions.get('window').width,
            height: 500,
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
                  backgroundColor: itemType.id === currentItemType?.id
                    ? 'rgba(240, 255, 0, .6)'
                    : 'rgba(255, 255, 255, .6)',
                }}
              >
                <Pressable
                  onPress={async () => {
                    await getItems(itemType.id).then((response) => setItems(response));
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
            )
          })}
        </ScrollView>
      </View>
      {inventory && (
        <ImageBackground
          source={{
            uri: theme.primary_background_url,
          }}
          style={{
            width: '100%',
            height: '100%',
            resizeMode: 'cover',
          }}
        >
          <View
            style={{
              flex: 1,
            }}
          >
            <FlatList
              style={{
                flex: 1,
                padding: 4,
              }}
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={({ item }) => <Item item={item} currentItemType={currentItemType} />}
              numColumns={3}
            />
          </View>
        </ImageBackground>
      )}
    </SafeAreaView>
  );
}
