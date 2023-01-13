import { useContext, useState } from 'react';
import {
  Dimensions,
  Image,
  ImageBackground,
  Modal,
  Pressable,
  Text,
  View,
} from 'react-native';
import Button from './Button';
import { RedeemablesType } from '../models/redeemables-type';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import theme from '../config/theme';

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
        onPress={() => {
          playSound(require('../../assets/sounds/modal_open.mp3'));
          setModalVisible(true);
        }}
      >
        <Image
          style={{
            width: 80,
            height: 80,
            resizeMode: 'contain',
          }}
          source={require('../../assets/images/screens/explore/list.png')}
        />
      </Button>
      <Modal
        animationType="fade"
        transparent={true}
        visible={modalVisible}
        onRequestClose={() => {
          playSound(require('../../assets/sounds/modal_close.mp3'));
          setModalVisible(false);
        }}
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
            onPress={() => {
              playSound(require('../../assets/sounds/modal_close.mp3'));
              setModalVisible(false);
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
          </Pressable>
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
              resizeMode={'contain'}
            >
              <Text
                style={{
                  fontFamily: 'Shark',
                  textTransform: 'uppercase',
                  color: 'white',
                  fontSize: 30,
                  marginTop: 128,
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
            <View
              style={{
                marginTop: -30,
                backgroundColor: 'white',
                borderRadius: 20,
                paddingTop: 55,
                paddingLeft: 35,
                paddingRight: 35,
                paddingBottom: 35,
                shadowColor: '#000',
                shadowOffset: {
                  width: 0,
                  height: 2,
                },
                shadowOpacity: 0.25,
                shadowRadius: 4,
                width: '80%',
                marginLeft: 'auto',
                marginRight: 'auto',
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
          </View>
        </View>
      </Modal>
    </>
  );
}
