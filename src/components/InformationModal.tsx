import { Image } from 'expo-image';
import { useState } from 'react';
import { Dimensions, Pressable, ScrollView, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import { useAsyncEffect } from 'rooks';
import getInformationModal from '../api/endpoints/information-modals/get';
import Button from './Button';
import Loading from './Loading';

export default function InformationModal({ id }: { readonly id?: number }) {
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);

  useAsyncEffect(async () => {
    if (!modalVisible) {
      return;
    }

    const response = await getInformationModal(id);
    setContent(response.content);
    setLoading(false);
  }, [modalVisible]);

  return (
    <>
      <Button
        onPress={async () => {
          if (!id) {
            return;
          }

          setModalVisible(true);
        }}
      >
        <Image
          style={{
            width: 35,
            height: 35,
            alignSelf: 'center',
          }}
          contentFit="contain"
          source={require('../../assets/images/faq.png')}
        />
      </Button>
      <Modal
        animationIn="zoomIn"
        animationOut="zoomOut"
        isVisible={modalVisible}
        hideModalContentWhileAnimating={true}
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
            onPress={async () => {
              setModalVisible(false);
            }}
          />
          <View
            style={{
              backgroundColor: 'white',
              width: Dimensions.get('window').width - 40,
              borderRadius: 20,
              shadowColor: '#000',
              shadowOffset: {
                width: 0,
                height: 2,
              },
              shadowOpacity: 0.25,
              shadowRadius: 4,
            }}
          >
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
              }}
              style={{
                height: '60%',
                marginLeft: 'auto',
                marginRight: 'auto',
              }}
            >
              <View
                style={{
                  flex: 1,
                  justifyContent: 'center',
                  alignItems: 'center',
                  padding: 32,
                }}
              >
                {loading && <Loading />}
                {!loading && (
                  <>
                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        fontSize: 32,
                        paddingBottom: 16,
                      }}
                    >
                      Need Help?
                    </Text>
                    <Text>{content}</Text>
                  </>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}
