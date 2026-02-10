import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import {
  Platform,
  Pressable,
  Text,
  View,
} from 'react-native';
import Modal from 'react-native-modal';
import * as Haptics from 'expo-haptics';
import config from '../config';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { SecretTaskType } from '../models/secret-task-type';
import { TaskType } from '../models/task-type';
import Ribbon from './Ribbon';
import YellowButton from './YellowButton';

interface Props {
  task: TaskType | SecretTaskType;
  isSecret?: boolean;
  isArchived?: boolean;
}

export default function UnfoundCoinModal({ task, isSecret = false, isArchived = false }: Props) {
  const [visible, setVisible] = useState(false);
  const { playSound } = useContext(SoundEffectContext);

  const handleOpen = () => {
    playSound(require('../../assets/sounds/tap.mp3'));
    if (Platform.OS === 'ios') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    setVisible(true);
  };

  return (
    <>
      <Pressable onPress={handleOpen}>
        <View
          style={{
            width: 60,
            height: 60,
            backgroundColor: 'rgba(0, 0, 0, .4)',
            borderRadius: 30,
            borderWidth: 2,
            borderColor: isSecret
              ? 'rgba(168,130,255,0.15)'
              : 'rgba(255,255,255,0.08)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 22,
              color: isSecret ? 'rgba(168,130,255,0.2)' : 'rgba(255,255,255,0.15)',
              fontFamily: 'Shark',
            }}
          >
            ?
          </Text>
        </View>
      </Pressable>

      <Modal
        isVisible={visible}
        onBackdropPress={() => setVisible(false)}
        onSwipeComplete={() => setVisible(false)}
        swipeDirection="down"
        animationIn="zoomIn"
        animationOut="zoomOut"
        backdropOpacity={0.85}
        hideModalContentWhileAnimating
      >
        <View style={{ alignItems: 'center', justifyContent: 'center', flex: 1 }}>
          <Pressable
            style={{ position: 'absolute', width: '100%', height: '100%' }}
            onPress={() => setVisible(false)}
          />
          <View style={{ alignItems: 'center', width: '85%', zIndex: 10 }}>
            <Ribbon text={isSecret ? 'Secret Coin' : isArchived ? 'Archived Coin' : 'Undiscovered Coin'} />

            <View
              style={{
                backgroundColor: '#1a1a2e',
                marginTop: '-10%',
                width: '95%',
                borderRadius: 20,
                borderWidth: 2.5,
                borderColor: isSecret
                  ? 'rgba(168,130,255,0.4)'
                  : 'rgba(255,255,255,0.15)',
                padding: 20,
                alignItems: 'center',
              }}
            >
              {/* Mystery coin silhouette */}
              <View
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 50,
                  backgroundColor: isSecret
                    ? 'rgba(168,130,255,0.1)'
                    : 'rgba(255,255,255,0.05)',
                  borderWidth: 3,
                  borderColor: isSecret
                    ? 'rgba(168,130,255,0.25)'
                    : 'rgba(255,255,255,0.1)',
                  borderStyle: 'dashed',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 16,
                }}
              >
                <Text
                  style={{
                    fontSize: 40,
                    color: isSecret
                      ? 'rgba(168,130,255,0.3)'
                      : 'rgba(255,255,255,0.15)',
                    fontFamily: 'Shark',
                  }}
                >
                  ?
                </Text>
              </View>

              {/* Task name (revealed!) */}
              <Text
                style={{
                  fontFamily: 'Shark',
                  fontSize: 18,
                  color: 'white',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  marginBottom: 8,
                }}
              >
                {task.name}
              </Text>

              {/* Hint text */}
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 14,
                  color: 'rgba(255,255,255,0.6)',
                  textAlign: 'center',
                  marginBottom: 16,
                  lineHeight: 20,
                }}
              >
                {isSecret
                  ? 'This is a secret coin! Explore the park to discover how to unlock it.'
                  : isArchived
                    ? 'This coin is from a past event. It may return in the future!'
                    : 'Visit this location in the park to collect this coin.'}
              </Text>

              {/* Rewards preview */}
              <View
                style={{
                  flexDirection: 'row',
                  gap: 16,
                  backgroundColor: 'rgba(255,255,255,0.05)',
                  borderRadius: 14,
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  marginBottom: 16,
                }}
              >
                <View style={{ alignItems: 'center' }}>
                  <Image
                    source={require('../../assets/images/coingold.png')}
                    style={{ width: 24, height: 24, marginBottom: 4 }}
                    contentFit="contain"
                  />
                  <Text
                    style={{
                      fontFamily: 'Shark',
                      fontSize: 18,
                      color: '#fbbf24',
                    }}
                  >
                    +{task.coins}
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.5)',
                      textTransform: 'uppercase',
                    }}
                  >
                    Coins
                  </Text>
                </View>

                <View
                  style={{
                    width: 1,
                    backgroundColor: 'rgba(255,255,255,0.1)',
                  }}
                />

                <View style={{ alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>⚡</Text>
                  <Text
                    style={{
                      fontFamily: 'Shark',
                      fontSize: 18,
                      color: '#60a5fa',
                    }}
                  >
                    +{task.experience}
                  </Text>
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      fontSize: 10,
                      color: 'rgba(255,255,255,0.5)',
                      textTransform: 'uppercase',
                    }}
                  >
                    XP
                  </Text>
                </View>
              </View>

              <YellowButton
                text="Got It!"
                onPress={() => setVisible(false)}
              />
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
