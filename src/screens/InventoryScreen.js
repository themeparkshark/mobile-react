import { SafeAreaView, ImageBackground, Text, View, Pressable, Image, ScrollView } from 'react-native';
import { useEffect, useState } from 'react';
import Playercard from '../components/Playercard';
import getInventory from '../api/endpoints/me/inventory';
import getItemTypes from '../api/endpoints/item-types/item-types';
import getItems from '../api/endpoints/me/inventory/items';
import updateInventory from '../api/endpoints/me/inventory/update-inventory';
import shark from '../../assets/images/screens/inventory/shark.png';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCircleCheck } from '@fortawesome/pro-light-svg-icons/faCircleCheck';
import { useContext } from 'react';
import { ThemeContext } from '../context/ThemeProvider';
import Topbar from '../components/Topbar';
import { AuthContext } from '../context/AuthProvider';

export default function InventoryScreen() {
  const [itemTypes, setItemTypes] = useState(null);
  const [currentItemType, setCurrentItemType] = useState(null);
  const [items, setItems] = useState(null);
  const { theme } = useContext(ThemeContext);
  const { inventory, setInventory, updateUser } = useContext(AuthContext);

  useEffect(() => {
    getInventory().then((response) => setInventory(response));
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
          <ScrollView
            style={{
              flex: 1,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
                padding: 4,
              }}
            >
              {items?.map((item) => {
                return (
                  <View
                    key={item.id}
                    style={{
                      padding: 8,
                      width: '33.33333%'
                    }}
                  >
                    <Pressable
                      style={{
                        backgroundColor: 'lightblue',
                        borderType: 'solid',
                        borderWidth: 6,
                        borderColor: 'white',
                        borderRadius: 10,
                        alignSelf: 'center',
                        shadowOffset: {
                          width: 0,
                          height: 3
                        },
                        shadowOpacity: .4,
                        shadowRadius: 0,
                        position: 'relative',
                        width: '100%',
                      }}
                      onPress={() => {
                        if (inventory.skin_item.id === item.id) {
                          return false;
                        }

                        updateInventory(item).then((response) => {
                          updateUser();
                          setInventory(response);
                        })
                      }}
                    >
                      <View
                        style={{
                          position: 'absolute',
                          display: Object.values(inventory).map(function (inventoryItem) {
                            return inventoryItem?.id;
                          }).includes(item.id) ? 'flex' : 'none',
                          backgroundColor: 'rgba(0, 0, 0, .6)',
                          top: 0,
                          left: 0,
                          right: 0,
                          bottom: 0,
                          width: '100%',
                          height: '100%',
                          zIndex: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                          borderRadius: 4,
                        }}
                      >
                        <FontAwesomeIcon
                          icon={faCircleCheck}
                          size={56}
                          color={'white'}
                        />
                      </View>
                      <View
                        style={{
                          padding: 12,
                        }}
                      >
                        {currentItemType.name === 'Body item' ? (
                          <ImageBackground
                            source={shark}
                            style={{
                              margin: -12,
                            }}
                          >
                            <Image
                              source={{
                                uri: item.paper_url,
                              }}
                              style={{
                                aspectRatio: 1,
                                resizeMode: 'contain',
                              }}
                            />
                          </ImageBackground>
                        ) : (
                          <Image
                            source={{
                              uri: item.icon_url,
                            }}
                            style={{
                              aspectRatio: 1,
                              resizeMode: 'contain',
                            }}
                          />
                        )}
                      </View>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ImageBackground>
      )}
    </SafeAreaView>
  );
}
