import * as AppleAuthentication from 'expo-apple-authentication';
import { useContext } from 'react';
import { SafeAreaView } from 'react-native';
import { AuthContext } from '../../context/AuthProvider';

export default function LoginScreen() {
  const { login } = useContext(AuthContext);

  return (
    <SafeAreaView>
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
          } catch (e) {
            if (e.code === 'ERR_CANCELED') {
              // handle that the user canceled the sign-in flow
            } else {
              // handle other errors
            }
          }
        }}
      />
    </SafeAreaView>
  );
}
