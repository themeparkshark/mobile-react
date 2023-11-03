import * as AppleAuthentication from 'expo-apple-authentication';
import { ReactNode, useContext } from 'react';
import { View } from 'react-native';
import { AuthContext } from '../context/AuthProvider';

export default function SignInButtons({
  children = null,
}: {
  readonly children?: ReactNode;
}) {
  const { login } = useContext(AuthContext);

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
          const credential = await AppleAuthentication.signInAsync({
            requestedScopes: [
              AppleAuthentication.AppleAuthenticationScope.EMAIL,
            ],
          });

          login(credential);
        }}
      />
      {children}
    </View>
  );
}
