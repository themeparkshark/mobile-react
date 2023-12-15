import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { InventoryType } from '../models/inventory-type';

export default function Playercard({
  inventory,
  style,
  showBackground = true,
}: {
  readonly inventory: InventoryType;
  readonly style: StyleProp<ViewStyle>;
  readonly showBackground?: boolean;
}) {
  const translate = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(translate, {
          toValue: 10,
          duration: 2700,
          useNativeDriver: true,
        }),
        Animated.timing(translate, {
          toValue: 0,
          duration: 2700,
          useNativeDriver: true,
        }),
      ])
    ).start();
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
        {inventory?.background_item && showBackground && (
          <Image
            source={{
              uri: inventory.background_item.paper_url,
            }}
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
            }}
            contentFit="cover"
          />
        )}
        {inventory?.pin_item && (
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
            }}
            contentFit="contain"
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
            ],
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
            {inventory?.skin_item && (
              <Image
                source={{
                  uri: inventory.skin_item.no_eye_url,
                }}
                style={styles.image}
                contentFit="contain"
              />
            )}
            <Image
              source={require('../../assets/images/screens/inventory/blink.png')}
              style={styles.image}
              contentFit="contain"
            />
            {inventory?.body_item && (
              <Image
                source={{
                  uri: inventory.body_item.paper_url,
                }}
                style={styles.image}
                contentFit="contain"
              />
            )}
            {inventory?.face_item && (
              <Image
                source={{
                  uri: inventory.face_item.paper_url,
                }}
                style={styles.image}
                contentFit="contain"
              />
            )}
            {inventory?.neck_item && (
              <Image
                source={{
                  uri: inventory.neck_item.paper_url,
                }}
                style={styles.image}
                contentFit="contain"
              />
            )}
            {inventory?.hand_item && (
              <Image
                source={{
                  uri: inventory.hand_item.paper_url,
                }}
                style={styles.image}
                contentFit="contain"
              />
            )}
            {inventory?.head_item && (
              <Image
                source={{
                  uri: inventory.head_item.paper_url,
                }}
                style={styles.image}
                contentFit="contain"
              />
            )}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: '100%',
    position: 'absolute',
  },
});
