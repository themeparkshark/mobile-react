import { BlurView } from 'expo-blur';
import * as AppleAuthentication from 'expo-apple-authentication';
import { ReactNode, useContext, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';
import { gameAlert, SharkLoader } from '../ui';
import { signInErrorCopy } from './signInErrors';

export default function SignInButtons({
  children = null,
  top = null,
  caption,
  width = 220,
  plain = false,
}: {
  readonly children?: ReactNode;
  /** Shown above the Apple button (the Login screen puts Play now first). */
  readonly top?: ReactNode;
  /** A short line right above the Apple button, such as 'I already have a shark'. */
  readonly caption?: string;
  /** Apple button width in points (at least 220). */
  readonly width?: number;
  /** No frosted panel: for a card that already has its own background. */
  readonly plain?: boolean;
}) {
  const { login } = useContext(AuthContext);
  const { labels, warnings } = useCrumbs();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const signingIn = useRef(false);

  return (
    <BlurView
      intensity={plain ? 0 : 40}
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
        style={plain ? { alignItems: 'center', paddingVertical: 4 } : {
          backgroundColor: 'rgba(255, 255, 255, 0.75)',
          padding: 24,
          borderRadius: 20,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: 'rgba(255,255,255,0.3)',
        }}
      >
        {top}
        {caption ? <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: '#05346e', textAlign: 'center',
          marginTop: top ? 16 : 0, marginBottom: 6 }}>{caption}</Text> : null}
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          cornerRadius={12}
          style={{ width: Math.max(220, width), height: 48 }}
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
              const copy = signInErrorCopy(error, appleCompleted, {
                title: warnings?.something_went_wrong, message: labels?.please_try_again,
              });
              if (copy) {
                gameAlert(copy.title, copy.message, undefined, { icon: 'info' });
              }
            } finally {
              signingIn.current = false;
              setIsSigningIn(false);
            }
          }}
        />
        {isSigningIn && (
          <View accessibilityRole="progressbar" accessibilityLabel="Signing in" style={{ marginTop: 12 }}>
            <SharkLoader compact title="Signing in" />
          </View>
        )}
        {children}
      </View>
    </BlurView>
  );
}
