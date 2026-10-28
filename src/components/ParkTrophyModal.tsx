import { Image } from 'expo-image';
import { ReactElement, useState } from 'react';
import { Dimensions, Pressable, Text, View } from 'react-native';
import Modal from 'react-native-modal';
import Button from '../components/Button';
import config from '../config';
import { UpperText } from '../ui/upper';
import { useNativeModalLayer } from '../ui/modalLayers';

/** "Unlocks at 12 wins here" / "Yours! 14 wins here". Every coin win at this park counts. */
export function trophyCopy(trophy: { readonly unlocked: boolean; readonly unlockCount: number; readonly wins?: number }): string {
  if (trophy.unlocked) return typeof trophy.wins === 'number' ? `Yours! ${trophy.wins} wins here` : 'Yours!';
  const left = typeof trophy.wins === 'number' ? Math.max(0, trophy.unlockCount - trophy.wins) : null;
  return left !== null ? `${left} more ${left === 1 ? 'win' : 'wins'} here` : `Unlocks at ${trophy.unlockCount} wins here`;
}

export default function ParkTrophyModal({
  children,
  trophy,
}: {
  readonly children: ReactElement;
  readonly trophy: {
    readonly name: string;
    readonly image: string;
    readonly unlocked: boolean;
    readonly unlockCount: number;
    /** Coin wins at this park (the server's park_coins_count). */
    readonly wins?: number;
  };
}) {
  const [visible, setVisible] = useState<boolean>(false);
  // One door for every sheet (blueprint 4.3 rule 10): the trophy reveal holds its layer until UIKit says it is gone.
  const layer = useNativeModalLayer(visible, 'show');

  return (
    <>
      <Button onPress={() => setVisible(true)} accessibilityLabel={`${trophy.name} trophy. ${trophyCopy(trophy)}`}>{children}</Button>
      <Modal
        animationIn="zoomIn"
        animationOut="zoomOut"
        swipeDirection="down"
        onSwipeComplete={() => setVisible(false)}
        onBackdropPress={() => setVisible(false)}
        isVisible={layer.present}
        onModalHide={layer.onDismissed}
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
            }}
            onPress={() => setVisible(false)}
          />
          <View
            style={{
              width: Dimensions.get('window').width - 50,
              alignItems: 'center',
            }}
          >
            <View
              style={{
                backgroundColor: config.primary,
                padding: 18,
                borderRadius: 10,
                marginBottom: 32,
              }}
            >
              <UpperText
                style={{
                  color: 'white',
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  fontSize: 32,
                  textAlign: 'center',
                }}
              >
                {trophy.name} Trophy
              </UpperText>
            </View>
            <Image
              source={trophy.image}
              style={{
                width: '80%',
                aspectRatio: 1,
                opacity: trophy.unlocked ? 1 : 0.6,
              }}
              contentFit="contain"
            />
            <View
              style={{
                backgroundColor: config.primary,
                padding: 18,
                borderRadius: 10,
                marginTop: 32,
              }}
            >
              <UpperText
                style={{
                  color: 'white',
                  fontFamily: 'Knockout',
                  textTransform: 'uppercase',
                  fontSize: 32,
                  textAlign: 'center',
                }}
              >
                {trophyCopy(trophy)}
              </UpperText>
              <Text style={{ color: '#d8f1ff', fontFamily: 'Knockout', fontSize: 16, textAlign: 'center', marginTop: 4 }}>
                Every coin you win at this park counts.
              </Text>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}
