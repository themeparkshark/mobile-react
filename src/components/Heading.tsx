import { Text, View } from 'react-native';
import config from '../config';

export default function Heading({ text }: { readonly text: string }) {
  return (
    <View
      style={{
        marginTop: 28,
        marginBottom: 14,
        paddingHorizontal: 4,
      }}
    >
      <Text
        style={{
          fontFamily: 'Shark',
          fontSize: 18,
          textTransform: 'uppercase',
          color: config.primary,
          letterSpacing: 1,
        }}
      >
        {text}
      </Text>
      <View
        style={{
          height: 3,
          width: 40,
          backgroundColor: config.tertiary,
          borderRadius: 2,
          marginTop: 6,
        }}
      />
    </View>
  );
}
