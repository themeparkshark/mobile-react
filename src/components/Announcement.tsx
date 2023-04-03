import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import {
  Dimensions,
  ImageBackground,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { AnnouncementType } from '../models/announcement-type';
import Button from './Button';
import useCrumbs from '../hooks/useCrumbs';

export default function Announcement({
  announcement,
}: {
  announcement: AnnouncementType;
}) {
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const { playSound } = useContext(SoundEffectContext);
  const { labels } = useCrumbs();

  return (
    <View>
      <Modal
        animationIn="slideInUp"
        animationOut="slideOutDown"
        isVisible={modalVisible}
        hasBackdrop={false}
        onModalWillHide={() => {
          playSound(require('../../assets/sounds/redeem_modal_close.mp3'));
        }}
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
          <ImageBackground
            style={{
              aspectRatio: 16 / 9,
            }}
            source={{
              uri: announcement.image_url,
            }}
          >
            <SafeAreaView>
              <View
                style={{
                  marginRight: 12,
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                }}
              >
                <Button onPress={() => setModalVisible(!modalVisible)}>
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
            </SafeAreaView>
          </ImageBackground>
          <SafeAreaView
            style={{
              flex: 1,
            }}
          >
            <ScrollView>
              <View
                style={{
                  padding: 32,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    textTransform: 'uppercase',
                    fontSize: 32,
                    paddingBottom: 16,
                  }}
                >
                  {announcement.title}
                </Text>
                <Text
                  style={{
                    paddingBottom: 8,
                  }}
                >
                  {announcement.content}
                </Text>
              </View>
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
      <TouchableOpacity
        onPress={() => setModalVisible(true)}
        style={{
          position: 'relative',
          width: Dimensions.get('window').width - 100,
          borderRadius: 10,
          overflow: 'hidden',
        }}
      >
        <ImageBackground
          source={{
            uri: announcement.image_url,
          }}
          style={{
            aspectRatio: 16 / 9,
            flexDirection: 'row',
          }}
        >
          <View
            style={{
              padding: 16,
              backgroundColor: 'rgba(0, 0, 0, .7)',
              width: '100%',
              justifyContent: 'space-between',
            }}
          >
            <View>
              <Text
                style={{
                  color: 'white',
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  fontSize: 22,
                }}
              >
                {announcement.title}
              </Text>
            </View>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 18,
                color: 'white',
                textTransform: 'uppercase',
              }}
            >
              {labels.read_more}
            </Text>
          </View>
        </ImageBackground>
      </TouchableOpacity>
    </View>
  );
}
