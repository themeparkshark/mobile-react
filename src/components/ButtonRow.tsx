import { Image } from 'expo-image';
import { sortBy } from 'lodash';
import { ScrollView, Text, View } from 'react-native';
import usePermissions from '../hooks/usePermissions';
import { ButtonType } from '../models/button-type';
import Button from './Button';

export default function ButtonRow({
  buttons,
}: {
  readonly buttons: ButtonType[];
}) {
  const { hasPermission } = usePermissions();

  const sortedButtons = sortBy(buttons, ['text']);

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
      {sortedButtons
        ?.filter((button) => !(button.hasOwnProperty('show') && !button.show))
        .map((button, index) => {
          return (
            <View key={index} style={{ width: 80 }}>
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
            </View>
          );
        })}
    </ScrollView>
  );
}
