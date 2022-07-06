import { useState, useEffect, useRef } from 'react';
import { Animated, ImageBackground, Dimensions, Image, Modal, Pressable, Text, View } from 'react-native';
import completeTask from '../api/endpoints/me/tasks/complete-task';
import redeem from '../../assets/images/screens/explore/redeem.png';
import collect from '../../assets/images/screens/explore/collect.png';
import watch from '../../assets/images/screens/explore/watch.png';
import xp from '../../assets/images/screens/explore/xp.png';
import coins from '../../assets/images/screens/explore/coins.png';
import Button from './Button';
import Lottie from 'lottie-react-native';

export default function RedeemModal({ redeemable, onPress }) {
  const [modalVisible, setModalVisible] = useState(false);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(Animated.timing(progress, {
      toValue: 1,
      duration: 2250,
      useNativeDriver: true,
    })).start();
  }, []);

  const completeRedeemable = async () => {
    await completeTask(redeemable);
    onPress();
    setModalVisible(false);
  };

  return (
    <>
      <Pressable onPress={() => setModalVisible(true)}>
        <Text
          style={{
            backgroundColor: 'orange',
            padding: 16,
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          Redeem
        </Text>
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
          <Lottie
            source={require('../../assets/animations/confetti.json')}
            progress={progress}
            style={{
              position: 'absolute',
              width: 900,
              height: 400,
              zIndex: 20,
              top: 15,
              left: -80,
            }}
          />
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
              Congratulations
            </Text>
            <Text
              style={{
                fontSize: 18,
                position: 'absolute',
                top: 280,
                left: 110,
                zIndex: 10,
              }}
            >
              {redeemable?.experience}
            </Text>
            <View
              style={{
                position: 'absolute',
                top: 160,
                left: 78,
                alignSelf: 'center',
              }}
            >
              <Image
                source={xp}
                style={{
                  width: 60,
                  resizeMode: 'contain',
                }}
              />
            </View>
            <Text
              style={{
                fontSize: 18,
                position: 'absolute',
                top: 280,
                left: 190,
                zIndex: 10,
              }}
            >
              {redeemable?.coins}
            </Text>
            <View
              style={{
                position: 'absolute',
                top: 153,
                left: 158,
                alignSelf: 'center',
              }}
            >
              <Image
                source={coins}
                style={{
                  width: 60,
                  resizeMode: 'contain',
                }}
              />
            </View>
            <View
              style={{
                position: 'absolute',
                bottom: 82,
                alignSelf: 'center',
              }}
            >
              <Button>
                <Image
                  source={watch}
                  style={{
                    width: 120,
                    height: 73,
                    resizeMode: 'contain',
                  }}
                />
              </Button>
            </View>
            <View
              style={{
                position: 'absolute',
                bottom: 30,
                alignSelf: 'center',
              }}
            >
              <Button onPress={() => completeRedeemable()}>
                <Image
                  source={collect}
                  style={{
                    width: 280,
                    height: 73,
                    resizeMode: 'contain',
                  }}
                />
              </Button>
            </View>
          </ImageBackground>
        </View>
      </Modal>
    </>
  );
}
