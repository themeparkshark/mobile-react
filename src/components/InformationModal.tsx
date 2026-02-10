import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import { useAsyncEffect } from 'rooks';
import getInformationModal from '../api/endpoints/information-modals/get';
import config from '../config';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import Loading from './Loading';

const modalOpenSound = require('../../assets/sounds/modal_open.mp3');
const modalCloseSound = require('../../assets/sounds/modal_close.mp3');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function InformationModal({ id }: { readonly id?: number }) {
  const [modalVisible, setModalVisible] = useState<boolean>(false);
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const { playSound } = useContext(SoundEffectContext);

  // Pulse animation for the help button
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  useAsyncEffect(async () => {
    if (!modalVisible) return;
    const response = await getInformationModal(id);
    setContent(response.content);
    setLoading(false);
  }, [modalVisible]);

  const openModal = () => {
    if (!id) return;
    playSound(modalOpenSound);
    setModalVisible(true);
  };

  const closeModal = () => {
    playSound(modalCloseSound);
    setModalVisible(false);
  };

  return (
    <>
      {/* Help button with subtle pulse */}
      <TouchableOpacity activeOpacity={0.7} onPress={openModal}>
        <Animated.View
          style={{
            transform: [{ scale: pulseAnim }],
            width: 35,
            height: 35,
            borderRadius: 999,
            backgroundColor: config.secondary,
            justifyContent: 'center',
            alignItems: 'center',
            shadowColor: config.secondary,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.4,
            shadowRadius: 6,
            elevation: 4,
          }}
        >
          <Text
            style={{
              fontFamily: 'Shark',
              fontSize: 20,
              color: 'white',
              textAlign: 'center',
              lineHeight: 22,
            }}
          >
            ?
          </Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Modal */}
      <Modal
        animationIn="slideInUp"
        animationOut="slideOutDown"
        isVisible={modalVisible}
        hideModalContentWhileAnimating
        backdropOpacity={0.6}
        useNativeDriverForBackdrop
        style={{ margin: 0, justifyContent: 'flex-end' }}
      >
        {/* Backdrop tap to close */}
        <Pressable
          style={{
            flex: 1,
          }}
          onPress={closeModal}
        />

        {/* Content sheet */}
        <View
          style={{
            backgroundColor: 'white',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '70%',
            overflow: 'hidden',
          }}
        >
          {/* Header with gradient */}
          <LinearGradient
            colors={[config.secondary, config.primary]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              paddingTop: 16,
              paddingBottom: 20,
              paddingHorizontal: 24,
              alignItems: 'center',
            }}
          >
            {/* Handle bar */}
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(255,255,255,0.4)',
                marginBottom: 16,
              }}
            />

            {/* Icon circle */}
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: 'rgba(255,255,255,0.2)',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 12,
                borderWidth: 2,
                borderColor: 'rgba(255,255,255,0.3)',
              }}
            >
              <Text style={{ fontSize: 28, color: 'white', fontFamily: 'Shark', lineHeight: 32 }}>?</Text>
            </View>

            <Text
              style={{
                fontFamily: 'Shark',
                fontSize: 24,
                color: 'white',
                textTransform: 'uppercase',
                textShadowColor: 'rgba(0,0,0,0.2)',
                textShadowRadius: 2,
                letterSpacing: 1,
              }}
            >
              Need Help?
            </Text>
          </LinearGradient>

          {/* Body */}
          <ScrollView
            contentContainerStyle={{
              flexGrow: 1,
              padding: 24,
              paddingBottom: 40,
            }}
            showsVerticalScrollIndicator={false}
          >
            {loading && (
              <View style={{ paddingVertical: 40 }}>
                <Loading />
              </View>
            )}
            {!loading && (
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 16,
                  color: '#333',
                  lineHeight: 24,
                }}
              >
                {content}
              </Text>
            )}
          </ScrollView>

          {/* Close button */}
          <View style={{ paddingHorizontal: 24, paddingBottom: 32 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={closeModal}
              style={{
                borderRadius: 16,
                overflow: 'hidden',
              }}
            >
              <LinearGradient
                colors={[config.secondary, '#0080cc']}
                style={{
                  paddingVertical: 14,
                  alignItems: 'center',
                  borderRadius: 16,
                }}
              >
                <Text
                  style={{
                    fontFamily: 'Shark',
                    fontSize: 18,
                    color: 'white',
                    textTransform: 'uppercase',
                    letterSpacing: 1,
                  }}
                >
                  Got It
                </Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
