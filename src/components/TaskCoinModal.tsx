import {TaskType} from '../models/task-type';
import {SecretTaskType} from '../models/secret-task-type';
import {Dimensions, Image, ImageBackground, Pressable, Text, View} from 'react-native';
import Modal from 'react-native-modal';
import { useState } from 'react';
import theme from '../config/theme';
import { Gyroscope } from 'expo-sensors';

export default function TaskCoinModal({ task } : {
  readonly task: TaskType | SecretTaskType;
}) {
  const [visible, setVisible] = useState<boolean>(false);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
      >
        <Image
          source={{
            uri: task.coin_url,
          }}
          style={{
            width: 60,
            height: 60,
            borderWidth: 2,
            borderColor: '#fff',
            borderRadius: 50,
          }}
        />
      </Pressable>
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
          >
          </Pressable>
          <View style={{
            width: Dimensions.get('window').width - 50,
            alignItems: 'center',
          }}>
            <View
              style={{
                backgroundColor: theme.primary,
                padding: 18,
                borderRadius: 10,
                marginBottom: 32,
              }}
            >
              <Text style={{
                color: 'white',
                fontFamily: 'Knockout',
                textTransform: 'uppercase',
                fontSize: 32,
                textAlign: 'center',
              }}>{task.name}</Text>
            </View>
            <Image
              source={{
                uri: task.coin_url,
              }}
              style={{
                width: '80%',
                aspectRatio: 1,
                borderWidth: 5,
                borderColor: '#fff',
                borderRadius: 999999,
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}
