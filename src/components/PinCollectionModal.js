import { useState, useContext } from 'react';
import { ImageBackground, Dimensions, Modal, Pressable, Text, View, Image } from 'react-native';
import redeem from '../../assets/images/screens/explore/redeem.png';
import star from '../../assets/images/screens/pin-collections/star.png';
import gradient from '../../assets/images/screens/store/gradient.png';
import darkstar from '../../assets/images/screens/pin-collections/darkstar.png';
import { ThemeContext } from '../context/ThemeProvider';

export default function pinCollectionModal({ pinCollection }) {
  const { theme } = useContext(ThemeContext);
  const [modalVisible, setModalVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setModalVisible(true)}
        style={{
          width: '33.333333%',
        }}
      >
        <View
          style={{
            position: 'relative',
            marginTop: 16,
          }}
        >
          {pinCollection.pins_count === 1 && (
            <Image
              source={star}
              style={{
                width: 30,
                height: 30,
                resizeMode: 'contain',
                position: 'absolute',
                zIndex: 10,
                right: -15,
                top: -15,
                transform: [
                  {
                    rotate: '25deg',
                  }
                ],
              }}
            />
          )}
          <View
            style={{
              borderRadius: 6,
              borderColor: '#fff',
              borderWidth: 3,
              borderStyle: 'solid',
              shadowOffset: {
                width: 0,
                height: 3
              },
              shadowOpacity: .4,
              shadowRadius: 0,
            }}
          >
            <ImageBackground
              source={gradient}
              style={{
                resizeMode: 'cover',
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  padding: 10,
                }}
              >
                <Image
                  source={{
                    uri: pinCollection.pin.item.paper_url,
                  }}
                  style={{
                    width: '100%',
                    height: 80,
                    resizeMode: 'contain',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}
                />
              </View>
            </ImageBackground>
            <View
              style={{
                padding: 6,
                flexDirection: 'row',
                justifyContent: 'center',
                backgroundColor: theme.secondary_color,
              }}
            >
              {[...Array(pinCollection.pins_count)].map((element, index) => {
                return (
                  <View
                    key={index}
                    style={{
                      paddingLeft: 1,
                      paddingRight: 1,
                      width: '20%',
                    }}
                  >
                    <Image
                      source={star}
                      style={{
                        width: '100%',
                        height: 20,
                        resizeMode: 'contain',
                      }}
                    />
                  </View>
                );
              })}
              {[...Array(5 - pinCollection.pins_count)].map((element, index) => {
                return (
                  <View
                    key={index}
                    style={{
                      paddingLeft: 1,
                      paddingRight: 1,
                      width: '20%',
                    }}
                  >
                    <Image
                      source={darkstar}
                      style={{
                        width: '100%',
                        height: 20,
                        resizeMode: 'contain',
                      }}
                    />
                  </View>
                );
              })}
            </View>
            <View
              style={{
                padding: 10,
                backgroundColor: theme.primary_color,
              }}
            >
              <Text
                style={{
                  color: '#fff',
                  textAlign: 'center',
                  fontSize: 18,
                  textTransform: 'uppercase',
                  fontFamily: 'Knockout',
                  textShadowOffset: {
                    width: -1,
                  },
                  textShadowColor: theme.primary_color,
                  textShadowRadius: 5,
                }}
              >
                {pinCollection.name}
              </Text>
            </View>
          </View>
        </View>
      </Pressable>
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => setModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              alignSelf: 'center',
              backgroundColor: 'rgba(0, 0, 0, .7)',
            }}
          />
          <ImageBackground
            source={redeem}
            resizeMode="contain"
            style={{
              width: Dimensions.get('window').width - 40,
              height: 500,
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              margin: 'auto',
              position: 'relative',
              zIndex: 20,
            }}
          >
            <Text
              style={{
                position: 'absolute',
                top: 25,
                fontSize: 28,
                alignSelf: 'center',
                textTransform: 'uppercase',
              }}
            >
              {pinCollection.name}
            </Text>
          </ImageBackground>
        </View>
      </Modal>
    </>
  );
}
