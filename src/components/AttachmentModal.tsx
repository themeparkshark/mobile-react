import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, SafeAreaView, TouchableOpacity, View } from 'react-native';
import Modal from 'react-native-modal';
import { AttachmentType } from '../models/attachment-type';
import Button from './Button';

export default function AttachmentModal({
  attachment,
}: {
  readonly attachment: AttachmentType;
}) {
  const [modalVisible, setModalVisible] = useState<boolean>(false);

  return (
    <>
      <TouchableOpacity onPress={() => setModalVisible(true)}>
        <Image
          source={attachment.path}
          style={{ aspectRatio: 16 / 9, borderRadius: 8 }}
          contentFit="cover"
        />
      </TouchableOpacity>
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
                position: 'relative',
                flex: 1,
              }}
            >
              <View
                style={{
                  flex: 1,
                  justifyContent: 'center',
                }}
              >
                <Image
                  source={attachment.path}
                  style={{
                    aspectRatio: 1,
                  }}
                  contentFit="contain"
                />
              </View>
              <View
                style={{
                  paddingLeft: 16,
                  paddingTop: 16,
                  position: 'absolute',
                  zIndex: 10,
                }}
              >
                <Button
                  onPress={() => {
                    setModalVisible(!modalVisible);
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
              </View>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </>
  );
}
