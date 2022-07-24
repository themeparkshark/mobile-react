import { Image, ImageBackground, Pressable, View } from 'react-native';
import updateInventory from '../api/endpoints/me/inventory/update-inventory';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { faCircleCheck } from '@fortawesome/pro-light-svg-icons/faCircleCheck';
import shark from '../../assets/images/screens/inventory/shark.png';
import { useContext } from 'react';
import { AuthContext } from '../context/AuthProvider';

export default function Item({item, currentItemType}) {
  const { inventory, setInventory, updateUser } = useContext(AuthContext);

  return (
    <View
      style={{
        width: '33.333333%',
        padding: 8,
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
};
