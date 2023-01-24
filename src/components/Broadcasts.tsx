import { View, Text, Dimensions } from 'react-native';
import { useContext } from 'react';
import { BroadcastContext } from '../context/BroadcastProvider';

export default function Broadcasts() {
  const { activeBroadcast } = useContext(BroadcastContext);

  return (
    activeBroadcast && (
      <View
        style={{
          width: Dimensions.get('window').width,
          position: 'absolute',
          top: 62,
          zIndex: 0,
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: '80%',
            backgroundColor: 'rgba(255, 255, 255, .8)',
            borderBottomLeftRadius: 10,
            borderBottomRightRadius: 10,
            borderColor: 'white',
            borderWidth: 3,
            paddingTop: 16,
            paddingBottom: 12,
            paddingLeft: 12,
            paddingRight: 12,
            shadowOffset: {
              width: 0,
              height: 0,
            },
            shadowOpacity: 0.4,
            shadowRadius: 3,
          }}
        >
          <Text
            style={{
              textAlign: 'center',
              fontFamily: 'Knockout',
              fontSize: 20,
            }}
          >
            {activeBroadcast.message}
          </Text>
        </View>
      </View>
    )
  );
}
