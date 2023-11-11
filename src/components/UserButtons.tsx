import { Image } from 'expo-image';
import { ScrollView, Text, View } from 'react-native';
import usePermissions from '../hooks/usePermissions';
import { ButtonType } from '../models/button-type';
import Button from './Button';

export default function UserButtons({
  buttons,
}: {
  readonly buttons: ButtonType[];
}) {
  const { hasPermission } = usePermissions();

  return (
    <ScrollView
      horizontal
      style={{
        marginTop: 24,
      }}
      contentContainerStyle={{
        flexGrow: 1,
        justifyContent: 'center',
        columnGap: 16,
      }}
    >
      {buttons
        ?.filter((button) => !(button.hasOwnProperty('show') && !button.show))
        .map((button, index) => {
          return (
            <View key={index} style={{ width: 80 }}>
              {button.disabled ? (
                <>
                  <Image
                    source={button.image}
                    style={{
                      width: 70,
                      aspectRatio: 1,
                      marginLeft: 'auto',
                      marginRight: 'auto',
                      opacity: 0.3,
                    }}
                    contentFit="contain"
                  />
                  {button.text && (
                    <Text
                      style={{
                        paddingTop: 8,
                        textAlign: 'center',
                        fontFamily: 'Knockout',
                        textTransform: 'uppercase',
                        fontSize: 16,
                        opacity: 0.3,
                      }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                    >
                      {button.text}
                    </Text>
                  )}
                </>
              ) : (
                <>
                  <Button
                    hasPermission={
                      button.permission !== undefined
                        ? hasPermission(button.permission)
                        : true
                    }
                    onPress={button.onPress}
                  >
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
                </>
              )}
            </View>
          );
        })}
    </ScrollView>
  );
}
