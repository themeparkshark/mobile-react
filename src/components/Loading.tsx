import { useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { useTimeoutWhen } from 'rooks';
import useCrumbs from '../hooks/useCrumbs';

export default function Loading() {
  const [showText, setShowText] = useState<boolean>(false);
  const { labels } = useCrumbs();

  useTimeoutWhen(
    () => {
      setShowText(true);
    },
    3000,
    true
  );

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
          {labels.slow_connectivity}
        </Text>
      )}
    </View>
  );
}
