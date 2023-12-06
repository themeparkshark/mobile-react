import { faFlag } from '@fortawesome/pro-light-svg-icons/faFlag';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useState } from 'react';
import {
  Alert,
  SafeAreaView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import reportComment from '../api/endpoints/comments/report';
import reportThread from '../api/endpoints/threads/report';
import useCrumbs from '../hooks/useCrumbs';

export default function CreateReport({
  model,
  showText,
}: {
  readonly model: {
    readonly id: number;
    readonly type: string;
  };
  readonly showText: boolean;
}) {
  const [modalVisible, setModalVisible] = useState(false);
  const { labels, messages } = useCrumbs();

  return (
    <View>
      <TouchableOpacity
        style={{
          flexDirection: 'row',
        }}
        onPress={() => setModalVisible(true)}
      >
        <FontAwesomeIcon icon={faFlag} size={16} color="black" />
        {showText && (
          <Text
            style={{
              paddingLeft: 16,
            }}
          >
            Report
          </Text>
        )}
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
              {labels.select_a_report_reason}
            </Text>
            {Object.entries(labels.report_reasons).map((option) => (
              <TouchableOpacity
                key={option[0]}
                style={{
                  padding: 8,
                }}
                onPress={async () => {
                  if (model.type === 'thread') {
                    await reportThread(model.id, option[0]);
                  }

                  if (model.type === 'comment') {
                    await reportComment(model.id, option[0]);
                  }

                  Alert.alert(messages.report_created, '', [
                    {
                      text: 'Ok',
                      onPress: () => {
                        setModalVisible(false);
                      },
                    },
                  ]);
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 16,
                  }}
                >
                  {option[1]}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
}
