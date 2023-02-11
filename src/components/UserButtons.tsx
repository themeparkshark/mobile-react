import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';
import { ButtonType } from '../models/button-type';
import Button from './Button';

export default function UserButtons({
  buttons,
}: {
  readonly buttons: ButtonType[];
}) {
  return (
    <View
      style={{
        paddingTop: 24,
        flexDirection: 'row',
        justifyContent: 'center',
      }}
    >
      {buttons
        ?.filter((button) => button.show !== null)
        .map((button, index) => {
          return (
            <Pressable
              key={index}
              style={{
                paddingLeft: 16,
                paddingRight: 16,
              }}
            >
              <Button onPress={button.onPress}>
                <Image
                  source={button.image}
                  style={{
                    width: 80,
                    height: 80,
                    marginLeft: 'auto',
                    marginRight: 'auto',
                  }}
                  contentFit="contain"
                />
              </Button>
              {button.text && (
                <Text
                  style={{
                    paddingTop: 8,
                    textAlign: 'center',
                    fontFamily: 'Knockout',
                    textTransform: 'uppercase',
                    fontSize: 20,
                  }}
                >
                  {button.text}
                </Text>
              )}
            </Pressable>
          );
        })}
    </View>
  );
}
