import { Image } from 'expo-image';
import { Text, View } from 'react-native';
import Tooltip from 'rn-tooltip';
import { PinType } from '../models/pin-type';

export default function Pin({ pin }: { readonly pin: PinType }) {
  return (
    <View
      key={pin.item.id}
      style={{
        padding: 8,
        width: '30%',
      }}
    >
      <Tooltip
        actionType="press"
        height="auto"
        popover={
          <Text
            style={{
              fontFamily: 'Knockout',
              fontSize: 20,
            }}
          >
            {pin.item.name}
          </Text>
        }
        withOverlay={false}
        backgroundColor="white"
        pointerColor="white"
      >
        <Image
          source={pin.item.icon_url}
          style={{
            width: '100%',
            height: 70,
            opacity: pin.item.has_purchased ? 1 : 0.4,
          }}
          contentFit="contain"
        />
      </Tooltip>
    </View>
  );
}
