import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import {useTimeoutWhen} from 'rooks';

export default function Loading() {
  const [showText, setShowText] = useState<boolean>(false);

  useTimeoutWhen(() => {
    setShowText(true);
  }, 3000, true);

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
