import { Image } from 'expo-image';
import { Platform, TextInput, View } from 'react-native';

interface Props {
  placeholder?: string;
  onChangeText: (text: string) => void;
  maxLength?: number;
  autoFocus?: boolean;
}

export default function SearchBar({
  placeholder = 'Search...',
  onChangeText,
  maxLength = 30,
  autoFocus = false,
}: Props) {
  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 10,
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderRadius: 14,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 14,
        paddingVertical: Platform.OS === 'ios' ? 12 : 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 6,
        elevation: 2,
      }}
    >
      <Image
        source={require('../../assets/images/screens/profile/settings.png')}
        style={{ width: 18, height: 18, opacity: 0.35, marginRight: 10 }}
        contentFit="contain"
      />
      <TextInput
        style={{
          flex: 1,
          fontSize: 16,
          fontFamily: 'Knockout',
          color: '#1a1a2e',
        }}
        placeholderTextColor="#a0aec0"
        placeholder={placeholder}
        onChangeText={onChangeText}
        maxLength={maxLength}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        enablesReturnKeyAutomatically
        autoFocus={autoFocus}
      />
    </View>
  );
}
