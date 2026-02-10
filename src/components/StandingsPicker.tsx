import React, { useContext, useState } from 'react';
import { SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import Modal from 'react-native-modal';
import config from '../config';
import { SoundEffectContext } from '../context/SoundEffectProvider';

const modalOpenSound = require('../../assets/sounds/modal_open.mp3');
const tapSound = require('../../assets/sounds/tap.mp3');

export interface PickerItem {
  label: string;
  value: number;
}

interface StandingsPickerProps {
  value: number | undefined;
  items: PickerItem[];
  onValueChange: (value: number) => void;
  title?: string;
}

export default function StandingsPicker({
  value,
  items,
  onValueChange,
  title = 'Select',
}: StandingsPickerProps) {
  const [visible, setVisible] = useState(false);
  const { playSound } = useContext(SoundEffectContext);

  const selectedLabel = items.find((i) => i.value === value)?.label ?? 'Select';

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => {
          playSound(modalOpenSound);
          setVisible(true);
        }}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderWidth: 3,
          borderRadius: 25,
          backgroundColor: config.secondary,
          borderColor: 'rgba(255,255,255,0.6)',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{
            color: 'white',
            fontSize: 18,
            fontFamily: 'Knockout',
            textAlign: 'center',
            textShadowColor: 'rgba(0, 0, 0, .3)',
            textShadowRadius: 3,
            flex: 1,
          }}
          numberOfLines={1}
        >
          {selectedLabel}
        </Text>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 10, marginLeft: 6 }}>▼</Text>
      </TouchableOpacity>

      <Modal
        isVisible={visible}
        onBackdropPress={() => setVisible(false)}
        onSwipeComplete={() => setVisible(false)}
        swipeDirection="down"
        style={{
          margin: 0,
          justifyContent: 'flex-end',
        }}
        backdropOpacity={0.5}
        animationIn="slideInUp"
        animationOut="slideOutDown"
        useNativeDriverForBackdrop
      >
        <SafeAreaView
          style={{
            backgroundColor: config.secondary,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            overflow: 'hidden',
          }}
        >
          {/* Handle bar */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 4 }}>
            <View
              style={{
                width: 36,
                height: 4,
                borderRadius: 2,
                backgroundColor: 'rgba(255,255,255,0.4)',
              }}
            />
          </View>

          {/* Title */}
          <Text
            style={{
              color: 'white',
              fontSize: 18,
              fontFamily: 'Shark',
              textAlign: 'center',
              textTransform: 'uppercase',
              paddingTop: 8,
              paddingBottom: 14,
              letterSpacing: 1,
              textShadowColor: 'rgba(0, 0, 0, .2)',
              textShadowRadius: 2,
            }}
          >
            {title}
          </Text>

          {/* Options */}
          <View style={{ paddingHorizontal: 14, paddingBottom: 24 }}>
            {items.map((item) => {
              const isSelected = item.value === value;
              return (
                <TouchableOpacity
                  key={item.value}
                  activeOpacity={0.7}
                  onPress={() => {
                    playSound(tapSound);
                    onValueChange(item.value);
                    setVisible(false);
                  }}
                  style={{
                    paddingVertical: 14,
                    paddingHorizontal: 18,
                    marginVertical: 3,
                    borderRadius: 16,
                    borderWidth: isSelected ? 2.5 : 0,
                    borderColor: 'rgba(255,255,255,0.8)',
                    backgroundColor: isSelected
                      ? 'rgba(255,255,255,0.2)'
                      : 'rgba(0,0,0,0.12)',
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      color: 'white',
                      fontSize: 18,
                      fontFamily: 'Knockout',
                      flex: 1,
                      textShadowColor: 'rgba(0, 0, 0, .2)',
                      textShadowRadius: 1,
                    }}
                  >
                    {item.label}
                  </Text>
                  {isSelected && (
                    <View
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: 11,
                        backgroundColor: 'white',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ color: config.secondary, fontSize: 14, fontWeight: 'bold' }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </SafeAreaView>
      </Modal>
    </>
  );
}
