import * as AppleAuthentication from 'expo-apple-authentication';
import { ReactNode, useContext } from 'react';
import { Alert, View } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from "../hooks/useCrumbs";

export default function SignInButtons({
  children = null,
}: {
  readonly children?: ReactNode;
}) {
  const { login } = useContext(AuthContext);
  const { labels, warnings } = useCrumbs();

  return (
    <View
      style={{
        backgroundColor: 'rgba(255, 255, 255, .8)',
        marginLeft: 'auto',
        marginRight: 'auto',
        padding: 16,
        borderRadius: 5,
      }}
    >
      <AppleAuthentication.AppleAuthenticationButton
        buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
        buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
        cornerRadius={5}
        style={{ width: 200, height: 44 }}
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
              Alert.alert(warnings., 'Please try again');
            }
          }
        }}
      />
      {children}
    </View>
  );
}
