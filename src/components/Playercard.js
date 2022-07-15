import { View, Image, Dimensions, StyleSheet, Animated } from 'react-native';
import asset from '../helpers/asset';
import { useEffect, useRef } from 'react';

export default function Playercard({ inventory, style }) {
  const translate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.sequence([
      Animated.timing(translate, {
        toValue: 10,
        duration: 4000,
        useNativeDriver: true,
      }),
      Animated.timing(translate, {
        toValue: 0,
        duration: 4000,
        useNativeDriver: true,
      }),
    ])).start();
  }, []);

  return (
    <View style={style}>
      <View
        style={{
          width: Dimensions.get('window').width,
          height: 500,
          position: 'relative',
        }}
      >
        { inventory?.background_item && (
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
        { inventory?.pin_item && (
          <Image
            source={{
              uri: inventory.pin_item.image_url,
            }}
            style={{
              width: 40,
              height: 40,
              position: 'absolute',
              left: 10,
              top: 100,
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
                  uri: inventory.skin_item.no_eye_url
                }}
                style={styles.image}
              />
            )}
            <Image
              source={{
                uri: asset('inventory/sharks/blink.gif'),
              }}
              style={styles.image}
            />
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
