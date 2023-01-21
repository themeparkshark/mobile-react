import { ActivityIndicator, Text, View } from 'react-native';
import { useEffect, useState } from 'react';

export default function Loading() {
  const [showText, setShowText] = useState<boolean>(false);

  useEffect(() => {
    const timeout = setTimeout(() => {
      setShowText(true);
    }, 3000);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        width: '75%',
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <ActivityIndicator size="large" color="rgba(0, 0, 0, .5)" />
      {showText && (
        <Text
          style={{
            textAlign: 'center',
            paddingTop: 16,
          }}
        >
          This is taking longer than usual, please check your internet
          connectivity.
        </Text>
      )}
    </View>
  );
}
