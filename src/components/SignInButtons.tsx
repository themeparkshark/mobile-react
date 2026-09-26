import { BlurView } from 'expo-blur';
import * as AppleAuthentication from 'expo-apple-authentication';
import { ReactNode, useContext, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';

export default function SignInButtons({
  children = null,
}: {
  readonly children?: ReactNode;
}) {
  const { login } = useContext(AuthContext);
  const { labels, warnings } = useCrumbs();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const signingIn = useRef(false);

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
        pointerEvents={isSigningIn ? 'none' : 'auto'}
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
            if (signingIn.current) return;
            signingIn.current = true;
            setIsSigningIn(true);
            let appleCompleted = false;
            try {
              const credential = await AppleAuthentication.signInAsync({
                requestedScopes: [
                  AppleAuthentication.AppleAuthenticationScope.EMAIL,
                ],
              });
              appleCompleted = true;
              await login(credential);
            } catch (error: any) {
              if (error?.code !== 'ERR_REQUEST_CANCELED') {
                Alert.alert(
                  appleCompleted ? "Couldn't sign in" : warnings?.something_went_wrong || "Couldn't sign in",
                  appleCompleted
                    ? 'Theme Park Shark sign-in is unavailable right now. Please check your connection and try again in a few minutes.'
                    : labels?.please_try_again || 'Please try again.'
                );
              }
            } finally {
              signingIn.current = false;
              setIsSigningIn(false);
            }
          }}
        />
        {isSigningIn && (
          <View
            accessibilityRole="progressbar"
            accessibilityLabel="Signing in"
            style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16 }}
          >
            <ActivityIndicator color="#09268f" />
            <Text style={{ color: '#09268f', marginLeft: 8 }}>Signing in…</Text>
          </View>
        )}
        {children}
      </View>
    </BlurView>
  );
}
