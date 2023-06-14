import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Button from '../components/Button';
import config from '../config';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';
import useCrumbs from '../hooks/useCrumbs';
import { vsprintf } from 'sprintf-js';

export default function TaskCoinModal({
  task,
  isSecretTask = false,
  timesCompleted,
}: {
  readonly isSecretTask?: boolean;
  readonly task: TaskType | SecretTaskType;
  readonly timesCompleted?: number;
}) {
  const [visible, setVisible] = useState<boolean>(false);
  const { labels } = useCrumbs();

  return (
    <>
      <Button onPress={() => setVisible(true)}>
        <Image
          source={task.coin_url}
          style={{
            width: 60,
            height: 60,
            borderWidth: 2,
            borderColor: '#fff',
            borderRadius: 50,
          }}
        />
      </Button>
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
                {task.name} {isSecretTask ? 'secret coin' : ''}
              </Text>
            </View>
            <Image
              source={task.coin_url}
              style={{
                width: '80%',
                aspectRatio: 1,
                borderWidth: 5,
                borderColor: '#fff',
                borderRadius: 999999,
              }}
            />
            {!isSecretTask && (
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
                  {vsprintf(labels.task_unlocks, [timesCompleted, (task as TaskType).completion_goal])}
                </Text>
              </View>
            )}
          </View>
        </View>
      </Modal>
    </>
  );
}
