import { Image } from 'expo-image';
import { ReactElement, useState } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Button from '../components/Button';
import config from '../config';

export default function ParkTrophyModal({
  children,
  trophy,
}: {
  readonly children: ReactElement;
  readonly trophy: {
    readonly name: string;
    readonly image: string;
    readonly unlocked: boolean;
    readonly unlockCount: number;
  };
}) {
  const [visible, setVisible] = useState<boolean>(false);

  return (
    <>
      <Button onPress={() => setVisible(true)}>{children}</Button>
      <Modal
        animationIn="zoomIn"
        animationOut="zoomOut"
        swipeDirection="down"
        isVisible={visible}
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Pressable
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
            }}
            onPress={() => setVisible(false)}
          />
          <View
            style={{
              width: Dimensions.get('window').width - 50,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: config.primary,
                padding: 18,
                borderRadius: 10,
                marginBottom: 32,
              }}
            >
              <Text
                style={{
                  color: 'white',
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  fontSize: 32,
                  textAlign: 'center',
                }}
              >
                {trophy.name} Trophy
              </Text>
            </View>
            <Image
              source={trophy.image}
              style={{
                width: '80%',
                aspectRatio: 1,
              }}
              contentFit="contain"
            />
            <View
              style={{
                backgroundColor: config.primary,
                padding: 18,
                borderRadius: 10,
                marginTop: 32,
              }}
            >
              <Text
                style={{
                  color: 'white',
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  fontSize: 32,
                  textAlign: 'center',
                }}
              >
                Unlocks at {trophy.unlockCount} park coins
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
