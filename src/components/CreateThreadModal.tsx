import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  Alert,
  Dimensions,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import createThread from '../api/endpoints/threads/create';
import Button from './Button';

export default function CreateThreadModal({
  onSubmit,
}: {
  readonly onSubmit: () => void;
}) {
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [title, setTitle] = useState<string>('');
  const [content, setContent] = useState<string>('');

  useEffect(() => {
    if (!modalVisible) {
      setTitle('');
      setContent('');
    }
  }, [modalVisible]);

  return (
    <>
      <Button onPress={() => setModalVisible(true)}>
        <Image
          style={{
            width: 35,
            height: 35,
            alignSelf: 'center',
          }}
          contentFit="contain"
          source={require('../../assets/images/screens/social/create_thread.png')}
        />
      </Button>
      <Modal
        animationIn="slideInUp"
        animationOut="slideOutDown"
        isVisible={modalVisible}
        hasBackdrop={false}
        style={{
          margin: 0,
        }}
      >
        <View
          style={{
            backgroundColor: 'white',
            width: Dimensions.get('window').width,
            height: Dimensions.get('window').height,
          }}
        >
          <SafeAreaView
            style={{
              flex: 1,
            }}
          >
            <View
              style={{
                paddingLeft: 16,
                paddingRight: 16,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingBottom: 16,
              }}
            >
              <Button
                onPress={() => {
                  if (title.length) {
                    Alert.alert(
                      'Are you sure you want to leave? This draft will not be saved.',
                      '',
                      [
                        {
                          text: 'Cancel',
                          style: 'cancel',
                        },
                        {
                          text: 'Ok',
                          onPress: async () => {
                            setModalVisible(false);
                          },
                        },
                      ]
                    );
                  } else {
                    setModalVisible(!modalVisible);
                  }
                }}
              >
                <Image
                  source={require('../../assets/images/screens/pin-collections/close.png')}
                  style={{
                    width: 35,
                    height: 35,
                  }}
                  contentFit="contain"
                />
              </Button>
              <TouchableOpacity
                disabled={!title.length}
                onPress={async () => {
                  await createThread({
                    title,
                    content,
                  });
                  onSubmit();
                  setModalVisible(false);
                }}
              >
                <Text>Submit</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
              }}
              style={{
                padding: 16,
              }}
            >
              <TextInput
                style={{
                  fontSize: 32,
                  fontFamily: 'Knockout',
                  width: '100%',
                }}
                autoFocus
                autoCapitalize="none"
                onChangeText={setTitle}
                value={title}
                placeholder="Title"
                returnKeyType="next"
                maxLength={140}
              />
              <TextInput
                style={{
                  fontSize: 16,
                  marginTop: 32,
                  width: '100%',
                }}
                autoCapitalize="none"
                onChangeText={setContent}
                value={content}
                placeholder="body text (optional)"
                returnKeyType="next"
              />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
