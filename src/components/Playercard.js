import { View, Image, StyleSheet, Animated } from 'react-native';
import asset from '../helpers/asset';
import { useContext, useEffect, useRef } from 'react';
import { AuthContext } from '../context/AuthProvider';
import { ThemeContext } from '../context/ThemeProvider';
import getInventory from '../api/endpoints/me/inventory';

export default function Playercard({style, showBackground = true, animate = true}) {
  const { user, inventory, setInventory } = useContext(AuthContext);
  const { theme } = useContext(ThemeContext);
  const translate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    getInventory().then((response) => setInventory(response));

    Animated.loop(Animated.sequence([
      Animated.timing(translate, {
        toValue: animate ? 10 : 0,
        duration: 2700,
        useNativeDriver: true,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: 2700,
        useNativeDriver: true,
      }),
    ])).start();
  }, []);

  return (
    <View style={style}>
      <View
        style={{
          width: '100%',
          height: '100%',
          position: 'relative',
        }}
      >
        { inventory?.background_item && showBackground && (
          <Image
            source={{
              uri: inventory.background_item.paper_url,
            }}
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              resizeMode: 'cover',
            }}
          />
        )}
        { user.verified_at && showBackground && (
          <Image
            source={{
              uri: theme.verified_badge_url,
            }}
            style={{
              width: 40,
              height: 40,
              position: 'absolute',
              left: 20,
              top: 90,
              resizeMode: 'contain',
            }}
          />
        )}
        { inventory?.pin_item && showBackground && (
          <Image
            source={{
              uri: inventory.pin_item.icon_url,
            }}
            style={{
              width: 40,
              height: 40,
              position: 'absolute',
              right: 20,
              top: 90,
              resizeMode: 'contain',
            }}
          />
        )}
        <Animated.View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            transform: [
              {
                translateY: translate,
              },
              {
                rotate: '-7deg',
              }
            ]
          }}
        >
          <View
            style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              marginTop: '5%',
            }}
          >
            { inventory?.skin_item && (
              <Image
                source={{
                  uri: animate ? inventory.skin_item.no_eye_url : inventory.skin_item.paper_url
                }}
                style={styles.image}
              />
            )}
            {
              animate && (
                <Image
                  source={{
                    uri: asset('inventory/sharks/blink.gif'),
                  }}
                  style={styles.image}
                />
              )
            }
            { inventory?.face_item && (
              <Image
                source={{
                  uri: inventory.face_item.paper_url
                }}
                style={styles.image}
              />
            )}
            { inventory?.body_item && (
              <Image
                source={{
                  uri: inventory.body_item.paper_url
                }}
                style={styles.image}
              />
            )}
            { inventory?.neck_item && (
              <Image
                source={{
                  uri: inventory.neck_item.paper_url
                }}
                style={styles.image}
              />
            )}
            { inventory?.hand_item && (
              <Image
                source={{
                  uri: inventory.hand_item.paper_url
                }}
                style={styles.image}
              />
            )}
            { inventory?.head_item && (
              <Image
                source={{
                  uri: inventory.head_item.paper_url
                }}
                style={styles.image}
              />
            )}
          </View>
        </Animated.View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  image: {
    resizeMode: 'contain',
    width: '100%',
    height: '100%',
    position: 'absolute',
  }
});
