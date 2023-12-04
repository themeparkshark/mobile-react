import React, { ReactNode, useContext, useState } from 'react';
import * as Clipboard from 'expo-clipboard';
import {
  Alert,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import * as RootNavigation from '../RootNavigation';
import deleteThread from '../api/endpoints/threads/delete';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';
import { ThreadType } from '../models/thread-type';

interface ThreadActionsProps {
  trigger: ReactNode;
  thread: ThreadType;
}

const ThreadActions: React.FC<ThreadActionsProps> = ({ trigger, thread }) => {
  const [modalVisible, setModalVisible] = useState(false);
  const { user } = useContext(AuthContext);
  const { labels, prompts, messages } = useCrumbs();

  const options = [
    {
      label: 'Copy text',
      onPress: async () => {
        await Clipboard.setStringAsync(thread.content);
        setModalVisible(false);
      },
      show: true,
    },
    {
      label: 'Delete thread',
      onPress: () => {
        Alert.alert(prompts.delete_thread, '', [
          {
            text: 'Cancel',
            style: 'cancel',
          },
          {
            text: 'Ok',
            onPress: async () => {
              await deleteThread(thread.id);

              Alert.alert(messages.thread_deleted, '', [
                {
                  text: 'Ok',
                  onPress: () => {
                    RootNavigation.goBack();
                  },
                },
              ]);
            },
          },
        ]);
      },
      show: thread?.user.id === user?.id,
      type: 'danger',
    },
  ];

  return (
    <View>
      <TouchableOpacity onPress={() => setModalVisible(true)}>
        {trigger}
      </TouchableOpacity>
      <Modal
        onBackdropPress={() => setModalVisible(false)}
        isVisible={modalVisible}
        style={{
          margin: 0,
          justifyContent: 'flex-end',
        }}
      >
        <SafeAreaView
          style={{
            backgroundColor: 'white',
            borderRadius: 8,
          }}
        >
          <View
            style={{
              padding: 16,
              width: '100%',
            }}
          >
            <Text
              style={{
                marginBottom: 16,
                fontFamily: 'Knockout',
                fontSize: 16,
              }}
            >
              {labels.more_actions}
            </Text>
            <View
              style={{
                rowGap: 16,
                borderTopColor: 'rgba(0, 0, 0, .4)',
                borderTopWidth: 1,
                paddingTop: 16,
              }}
            >
              {options
                .filter((option) => option.show)
                .map((option, index) => (
                  <TouchableOpacity
                    key={index}
                    onPress={() => option.onPress()}
                  >
                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        fontSize: 16,
                        color: option?.type === 'danger' ? config.red : 'black',
                      }}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

export default ThreadActions;
