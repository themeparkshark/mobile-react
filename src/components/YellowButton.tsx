import { Text, ImageBackground, View, Animated, Pressable } from 'react-native';
import Button from './Button';

export default function YellowButton({
  text,
  onPress,
}: {
  readonly text: string;
  readonly onPress?: () => void;
}) {
  const animated = new Animated.Value(1);
  const zoomOut = () => {
    Animated.timing(animated, {
      toValue: 0.95,
      duration: 25,
      useNativeDriver: true,
    }).start();
  };
  const zoomIn = () => {
    Animated.timing(animated, {
      toValue: 1,
      duration: 25,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Pressable onPress={onPress} onPressIn={zoomOut} onPressOut={zoomIn}>
      <Animated.View
        style={{
          transform: [
            {
              scale: animated,
            },
          ],
        }}
      >
        <ImageBackground
          source={require('../../assets/images/yellow_button.png')}
          style={{
            width: 190,
            height: 50,
          }}
          resizeMode={'contain'}
        >
          <View
            style={{
              justifyContent: 'center',
              flex: 1,
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              style={{
                textAlign: 'center',
                fontSize: 32,
                color: 'white',
                fontFamily: 'Shark',
                textTransform: 'uppercase',
                textShadowColor: '#000000',
                textShadowRadius: 5,
                marginTop: -5,
                paddingLeft: 32,
                paddingRight: 32,
                paddingTop: 12,
                paddingBottom: 12,
              }}
            >
              {text}
            </Text>
          </View>
        </ImageBackground>
      </Animated.View>
    </Pressable>
  );
}
