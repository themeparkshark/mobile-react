import React, { useState } from 'react';
import { SafeAreaView, Text, TouchableOpacity, View } from 'react-native';
import Modal from 'react-native-modal';

export interface SortOption {
  label: string;
  value: string;
}

interface SortByDropdownProps {
  activeOption: SortOption;
  onChange: (activeOption: SortOption) => void;
  options: SortOption[];
  resource: string;
  title: string;
}

const SortByDropdown: React.FC<SortByDropdownProps> = ({
  activeOption,
  onChange,
  options,
  resource,
  title,
}) => {
  const [modalVisible, setModalVisible] = useState(false);

  const handleOptionSelect = (option: SortOption) => {
    onChange(option);
    setModalVisible(false);
  };

  return (
    <View>
      <TouchableOpacity onPress={() => setModalVisible(true)}>
        <Text
          style={{
            textTransform: 'uppercase',
            fontFamily: 'Knockout',
          }}
        >
          {activeOption.label} {resource}
        </Text>
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
              {title}
            </Text>
            {options.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={{
                  padding: 8,
                  backgroundColor:
                    activeOption?.value === option.value ? '#e6e6e6' : 'white',
                }}
                onPress={() => handleOptionSelect(option)}
              >
                <Text
                  style={{
                    fontFamily: 'Knockout',
                    fontSize: 16,
                  }}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </SafeAreaView>
      </Modal>
    </View>
  );
};

export default SortByDropdown;
