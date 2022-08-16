import Topbar from '../components/Topbar';
import { Dimensions, FlatList, Image, ImageBackground, Pressable, Text, View } from 'react-native';
import all from '../api/endpoints/pin-collections/all';
import { useContext, useEffect, useState } from 'react';
import { ThemeContext } from '../context/ThemeProvider';
import gradient from '../../assets/images/screens/store/gradient.png';
import star from '../../assets/images/screens/pin-collections/star.png';
import darkstar from '../../assets/images/screens/pin-collections/darkstar.png';

export default function PinCollectionsScreen() {
  const [collections, setCollections] = useState();
  const { theme } = useContext(ThemeContext);

  useEffect(() => {
    all().then((response) => setCollections(response));
  }, []);

  return (
    <>
      <Topbar
        text={'Pin Packs'}
        showBackButton={true}
      />
      <View
        style={{
          flex: 1,
          marginTop: -8,
        }}
      >
        <ImageBackground
          style={{
            flex: 1,
            paddingTop: 8,
          }}
          source={{
            uri: theme.secondary_background_url,
          }}
        >
          <View>
            <View
              style={{
                height: 300,
              }}
            >
              <Image
                source={{
                  uri: theme.pin_collections_promotion_image_url,
                }}
                style={{
                  width: Dimensions.get('window').width - 25,
                  height: '100%',
                  resizeMode: 'contain',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              />
            </View>
            <View
              style={{
                paddingTop: 0,
                paddingLeft: 16,
                paddingRight: 16,
                paddingBottom: 48,
                backgroundColor: 'rgba(255, 255, 255, .6)',
                borderTopWidth: 5,
                borderTopStyle: 'solid',
                borderTopColor: '#fff',
                height: '100%',
              }}
            >
              <View
                style={{
                  flex: 1,
                }}
              >
                {collections && (
                  <FlatList
                    style={{
                      flex: 1,
                      padding: 4,
                    }}
                    data={collections}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => {
                      return (
                        <View
                          style={{
                            width: '33.333333%',
                            position: 'relative',
                            marginTop: 16,
                          }}
                        >
                          {item.pins_count === 1 && (
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
                          <Pressable
                            onPress={() => {

                            }}
                          >
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
                                      uri: item.pin.item.paper_url,
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
                                {[...Array(item.pins_count)].map((element, index) => {
                                  return (
                                    <View
                                      style={{
                                        paddingLeft: 1,
                                        paddingRight: 1,
                                        width: '20%',
                                      }}
                                    >
                                      <Image
                                        key={index}
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
                                {[...Array(5 - item.pins_count)].map((element, index) => {
                                  return (
                                    <View
                                      style={{
                                        paddingLeft: 1,
                                        paddingRight: 1,
                                        width: '20%',
                                      }}
                                    >
                                      <Image
                                        key={index}
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
                                  {item.name}
                                </Text>
                              </View>
                            </View>
                          </Pressable>
                        </View>
                      );
                    }}
                    numColumns={3}
                  />
                )}
              </View>
            </View>
          </View>
        </ImageBackground>
      </View>
    </>
  );
};
