import { Text, View } from 'react-native';

export default function ErrorScreen() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text>There was an error.</Text>
    </View>
  );
}
