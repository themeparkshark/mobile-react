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
              height: 400,
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
                  textShadowColor: theme.primary,
                  textShadowRadius: 5,
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
                alignItems: 'center',
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
                  <Text
                    key={task.id}
                    style={{
                      fontSize: 16,
                      paddingTop: index === 0 ? 0 : 8,
                    }}
                  >
                    {task.name}
                  </Text>
                );
              })}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
