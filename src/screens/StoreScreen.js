import { ImageBackground, Text, ScrollView, Dimensions, View, Image, SafeAreaView } from 'react-native';
import getStore from '../api/endpoints/stores/get';
import { useContext, useEffect, useState } from 'react';
import Topbar from '../components/Topbar';
import coins from '../../assets/images/coins.png';
import diamonds from '../../assets/images/purple_diamonds.png';
import { ThemeContext } from '../context/ThemeProvider';
import { AuthContext } from '../context/AuthProvider';

export default function StoreScreen({ route }) {
  const { store } = route.params;
  const [currentStore, setCurrentStore] = useState(null);
  const { theme } = useContext(ThemeContext);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    getStore(store).then((response) => setCurrentStore(response))
  }, []);

  return (
    <>
      <Topbar text={currentStore?.name} />
      <View style={{ flex: 1}}>
        <ImageBackground
          style={{
            flex: 1,
            backgroundColor: 'red',
          }}
        >
          <ScrollView>
            <Text>test</Text>
          </ScrollView>
        </ImageBackground>
      </View>
      <SafeAreaView
        style={{
          width: Dimensions.get('window').width,
          marginBottom: -45,
        }}
      >
        <ImageBackground
          source={{
            uri: theme.bottom_bar_url,
          }}
          resizeMode="cover"
          style={{
            height: 100,
          }}
        >
          <View
            style={{
              paddingLeft: 24,
              paddingRight: 24,
              display: 'flex',
              flexDirection: 'row',
              justifyContent: 'space-between',
              paddingTop: 16,
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Image
                source={coins}
                style={{
                  width: 30,
                  height: 30,
                  resizeMode: 'contain',
                  marginRight: 16,
                }}
              />
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 24,
                  color: 'white',
                  fontFamily: 'Shark',
                  textTransform: 'uppercase',
                  textShadowOffset: {
                    width: -1,
                  },
                  textShadowColor: theme.primary_color,
                  textShadowRadius: 5,
                }}
              >
                {user?.coins}
              </Text>
            </View>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 24,
                  color: 'white',
                  fontFamily: 'Shark',
                  textTransform: 'uppercase',
                  textShadowOffset: {
                    width: -1,
                  },
                  textShadowColor: theme.primary_color,
                  textShadowRadius: 5,
                }}
              >
                {user?.purple_diamonds}
              </Text>
              <Image
                source={diamonds}
                style={{
                  width: 30,
                  height: 30,
                  resizeMode: 'contain',
                  marginLeft: 16,
                }}
              />
            </View>
          </View>
        </ImageBackground>
      </SafeAreaView>
    </>
  );
}
