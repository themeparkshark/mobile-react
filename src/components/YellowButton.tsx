import { Animated, ImageBackground, Pressable, Text, View } from 'react-native';

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
            width: '100%',
            aspectRatio: 3.8,
          }}
          resizeMode="contain"
        >
          <View
            style={{
              justifyContent: 'center',
              aspectRatio: 4.4,
            }}
          >
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit={true}
              style={{
                textAlign: 'center',
                fontSize: 72,
                color: 'white',
                fontFamily: 'Shark',
                textTransform: 'uppercase',
                textShadowColor: 'rgba(0, 0, 0, .5)',
                textShadowOffset: {
                  width: 1,
                  height: 1,
                },
                textShadowRadius: 0,
                paddingTop: 4,
                paddingBottom: 4,
                paddingLeft: 24,
                paddingRight: 24,
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
