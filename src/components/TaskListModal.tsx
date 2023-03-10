import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import { RedeemablesType } from '../models/redeemables-type';
import Button from './Button';

export default function TaskListModal({
  redeemables,
}: {
  readonly redeemables: RedeemablesType;
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const [modalVisible, setModalVisible] = useState<boolean>(false);

  return (
    <>
      <Button
        onPressSound={require('../../assets/sounds/modal_open.mp3')}
        onPress={() => {
          setModalVisible(true);
        }}
      >
        <Image
          style={{
            width: 70,
            height: 70,
          }}
          source={require('../../assets/images/screens/explore/list.png')}
          contentFit="contain"
        />
      </Button>
      <Modal
        animationIn="slideInUp"
        animationOut="slideOutDown"
        isVisible={modalVisible}
        onModalWillHide={() => {
          playSound(require('../../assets/sounds/modal_close.mp3'));
        }}
        propagateSwipe={true}
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
            onPress={() => setModalVisible(false)}
          />
          <View
            style={{
              top: 0,
              bottom: 0,
              left: 0,
              right: 0,
              margin: 'auto',
              position: 'relative',
              width: Dimensions.get('window').width - 50,
            }}
          >
            <ImageBackground
              source={require('../../assets/images/screens/explore/tasklist.png')}
              style={{
                width: '100%',
                height: 195,
                zIndex: 10,
              }}
              resizeMode="contain"
            >
              <Text
                style={{
                  fontFamily: 'Shark',
                  textTransform: 'uppercase',
                  color: 'white',
                  fontSize: 30,
                  marginTop: 125,
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  textShadowColor: 'rgba(0, 0, 0, .5)',
                  textShadowOffset: {
                    width: 2,
                    height: 2,
                  },
                  textShadowRadius: 0,
                }}
              >
                Uncompleted Tasks
              </Text>
            </ImageBackground>
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
              }}
              style={{
                marginTop: -30,
                backgroundColor: 'white',
                borderRadius: 20,
                shadowColor: '#000',
                shadowOffset: {
                  width: 0,
                  height: 2,
                },
                shadowOpacity: 0.25,
                shadowRadius: 4,
                width: '80%',
                maxHeight: '80%',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              <View
                style={{
                  paddingTop: 45,
                  paddingRight: 35,
                  paddingLeft: 35,
                  paddingBottom: 15,
                  flex: 1,
                  justifyContent: 'center',
                }}
              >
                {redeemables?.tasks.map((task, index) => {
                  return (
                    <View key={task.id}>
                      <Text
                        style={{
                          textAlign: 'center',
                          fontFamily: 'Knockout',
                          fontSize: 20,
                          paddingTop: index === 0 ? 0 : 16,
                        }}
                      >
                        {task.name}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
