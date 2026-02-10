import { Image } from 'expo-image';
import { useRef } from 'react';
import { Animated, ScrollView, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import usePermissions from '../hooks/usePermissions';
import { ButtonType } from '../models/button-type';
import Button from './Button';

/** Bouncy modern tile button with spring press + haptic */
function ModernButton({
  button,
  hasPermission,
}: {
  button: ButtonType;
  hasPermission: boolean;
}) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.85,
      duration: 80,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 3,
      tension: 400,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Button
      hasPermission={hasPermission}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        button.onPress();
      }}
    >
      <Animated.View
        style={{
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderRadius: 18,
          padding: 12,
          alignItems: 'center',
          width: 80,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.08,
          shadowRadius: 6,
          elevation: 3,
          transform: [{ scale: scaleAnim }],
        }}
        onTouchStart={handlePressIn}
        onTouchEnd={handlePressOut}
        onTouchCancel={handlePressOut}
      >
        <Image
          source={button.image}
          style={{ width: 50, aspectRatio: 1 }}
          contentFit="contain"
        />
      </Animated.View>
    </Button>
  );
}

export default function PlayerButtons({
  buttons,
  modern = false,
}: {
  readonly buttons: ButtonType[];
  readonly modern?: boolean;
}) {
  const { hasPermission } = usePermissions();

  if (modern) {
    return (
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 12,
          marginTop: 20,
          justifyContent: 'center',
        }}
      >
        {buttons
          ?.filter((button) => !(button.hasOwnProperty('show') && !button.show))
          .map((button, index) => {
            const disabled = !!button.disabled;
            return (
              <View key={index} style={{ width: 90, alignItems: 'center' }}>
                {disabled ? (
                  <View
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.6)',
                      borderRadius: 18,
                      padding: 12,
                      alignItems: 'center',
                      opacity: 0.4,
                      width: 80,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.06,
                      shadowRadius: 4,
                      elevation: 2,
                    }}
                  >
                    <Image
                      source={button.image}
                      style={{ width: 50, aspectRatio: 1 }}
                      contentFit="contain"
                    />
                  </View>
                ) : (
                  <ModernButton
                    button={button}
                    hasPermission={
                      button.permission !== undefined
                        ? hasPermission(button.permission)
                        : true
                    }
                  />
                )}
                {button.text && (
                  <Text
                    style={{
                      paddingTop: 8,
                      textAlign: 'center',
                      fontFamily: 'Knockout',
                      textTransform: 'uppercase',
                      fontSize: 13,
                    }}
                    numberOfLines={2}
                    adjustsFontSizeToFit
                  >
                    {button.text}
                  </Text>
                )}
              </View>
            );
          })}
      </View>
    );
  }

  // Original style
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
