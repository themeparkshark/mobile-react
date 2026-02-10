import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import { Pressable } from 'react-native';
import { SoundEffectContext } from '../context/SoundEffectProvider';
import { PinType } from '../models/pin-type';
import HoloPinPreview from './HoloPinPreview';

export default function Pin({ pin }: { readonly pin: PinType }) {
  const [showPreview, setShowPreview] = useState(false);
  const { playSound } = useContext(SoundEffectContext);

  return (
    <>
      <Pressable
        key={pin.item.id}
        onPress={() => {
          playSound(require('../../assets/sounds/tap.mp3'));
          setShowPreview(true);
        }}
        style={{
          padding: 8,
          width: '30%',
        }}
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
      </Pressable>
      <HoloPinPreview
        pin={pin}
        visible={showPreview}
        onClose={() => setShowPreview(false)}
      />
    </>
  );
}
