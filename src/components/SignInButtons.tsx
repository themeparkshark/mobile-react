import { BlurView } from 'expo-blur';
import * as AppleAuthentication from 'expo-apple-authentication';
import { ReactNode, useContext } from 'react';
import { Alert, View } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';

export default function SignInButtons({
  children = null,
}: {
  readonly children?: ReactNode;
}) {
  const { login } = useContext(AuthContext);
  const { labels, warnings } = useCrumbs();

  return (
    <BlurView
      intensity={40}
      tint="light"
      style={{
        marginLeft: 'auto',
        marginRight: 'auto',
        borderRadius: 20,
        overflow: 'hidden',
      }}
    >
      <View
        style={{
          backgroundColor: 'rgba(255, 255, 255, 0.75)',
          padding: 24,
          borderRadius: 20,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.3)',
        }}
      >
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={{ width: 220, height: 48 }}
          onPress={async () => {
            try {
              const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                  AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
              });

              login(credential);
            } catch (error) {
              if (error.code !== 'ERR_REQUEST_CANCELED') {
                Alert.alert(
                  warnings.something_went_wrong,
                  labels.please_try_again
                );
              }
            }
          }}
        />
        {children}
      </View>
    </BlurView>
  );
}
