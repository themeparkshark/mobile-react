import { Image } from 'expo-image';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { ButtonType } from '../models/button-type';
import Button from './Button';

export default function UserButtons({
  buttons,
}: {
  readonly buttons: ButtonType[];
}) {
  return (
    <ScrollView
      horizontal
      style={{
        marginTop: 24,
      }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
      }}
    >
      {buttons
        ?.filter((button) => button.show)
        .map((button, index) => {
          return (
            <View
              key={index}
              style={{
                flex: 1,
                paddingLeft: 8,
                paddingRight: 8,
              }}
            >
              <Pressable>
                <Button onPress={button.onPress}>
                  <Image
                    source={button.image}
                    style={{
                      width: 70,
                      aspectRatio: 1,
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
                      fontSize: 16,
                    }}
                  >
                    {button.text}
                  </Text>
                )}
              </Pressable>
            </View>
          );
        })}
    </ScrollView>
  );
}
