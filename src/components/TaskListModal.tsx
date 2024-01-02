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
import { vsprintf } from 'sprintf-js';
import { LocationContext } from '../context/LocationProvider';
import {
  SoundEffectContext,
  SoundEffectContextType,
} from '../context/SoundEffectProvider';
import useCrumbs from '../hooks/useCrumbs';
import { TaskType } from '../models/task-type';
import Button from './Button';

export default function TaskListModal({
  tasks,
}: {
  readonly tasks: TaskType[];
}) {
  const { playSound } = useContext<SoundEffectContextType>(SoundEffectContext);
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const { labels } = useCrumbs();
  const { park } = useContext(LocationContext);

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
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Image
            source={require('../../assets/images/screens/pin-collections/close.png')}
            style={{
              width: 50,
              height: 53,
              position: 'absolute',
              bottom: 0,
            }}
            contentFit="contain"
          />
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
              justifyContent: 'center',
              position: 'relative',
              width: Dimensions.get('window').width - 50,
              height: '100%',
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
            <ImageBackground
              source={require('../../assets/images/screens/explore/tasklist.png')}
              style={{
                width: '100%',
                aspectRatio: 1.97,
                zIndex: 10,
                position: 'relative',
              }}
              resizeMode="contain"
            >
              <Text
                style={{
                  fontFamily: 'Shark',
                  textTransform: 'uppercase',
                  color: 'white',
                  fontSize: 30,
                  position: 'absolute',
                  width: '100%',
                  textAlign: 'center',
                  bottom: '15%',
                  textShadowColor: 'rgba(0, 0, 0, .5)',
                  textShadowOffset: {
                    width: 2,
                    height: 2,
                  },
                  textShadowRadius: 0,
                }}
              >
                {labels.task_list_modal_heading}
              </Text>
            </ImageBackground>
            <View
              style={{
                maxHeight: '40%',
              }}
            >
              <ScrollView
                contentContainerStyle={{
                  flexGrow: 1,
                }}
                style={{
                  marginTop: -25,
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
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                <View
                  style={{
                    paddingTop: 45,
                    paddingRight: 35,
                    paddingLeft: 35,
                    paddingBottom: 30,
                    justifyContent: 'center',
                  }}
                >
                  {!tasks.length && (
                    <Text
                      style={{
                        textAlign: 'center',
                        fontFamily: 'Knockout',
                        fontSize: 20,
                      }}
                    >
                      {vsprintf(labels.all_tasks_completed, [park.name])}
                    </Text>
                  )}
                  {tasks.length > 0 &&
                    tasks.map((task, index) => {
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
        </View>
      </Modal>
    </>
  );
}
