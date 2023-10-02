import { BlurView } from 'expo-blur';
import { useContext, useState } from 'react';
import { Dimensions, Text, View } from 'react-native';
import { useIntervalWhen } from 'rooks';
import { vsprintf } from 'sprintf-js';
import SignInButtons from '../../components/SignInButtons';
import { AuthContext } from '../../context/AuthProvider';
import useCrumbs from '../../hooks/useCrumbs';

export default function NotAtPark() {
  const [seconds, setSeconds] = useState<number>(5);
  const { labels, warnings } = useCrumbs();
  const { user } = useContext(AuthContext);

  useIntervalWhen(
    () => {
      if (seconds === 1) {
        setSeconds(5);
      } else {
        setSeconds(seconds - 1);
      }
    },
    1000,
    Boolean(!!seconds && user)
  );

  return (
    <BlurView
      intensity={80}
      tint="dark"
      style={{
        zIndex: 10,
        alignSelf: 'center',
        position: 'absolute',
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
        alignItems: 'center',
        justifyContent: 'center',
        paddingLeft: 48,
        paddingRight: 48,
      }}
    >
      <Text
        style={{
          color: 'white',
          fontFamily: 'Shark',
          textTransform: 'uppercase',
          textShadowColor: 'rgba(0, 0, 0, .5)',
          textShadowOffset: {
            width: 2,
            height: 2,
          },
          textShadowRadius: 0,
          fontSize: 32,
          textAlign: 'center',
        }}
      >
        {user ? warnings.not_at_a_park : warnings.not_signed_in}
      </Text>
      <Text
        style={{
          color: 'white',
          textAlign: 'center',
          fontFamily: 'Knockout',
          fontSize: 20,
          paddingTop: 30,
          textShadowColor: 'rgba(0, 0, 0, .5)',
          textShadowOffset: {
            width: 2,
            height: 2,
          },
          textShadowRadius: 0,
        }}
      >
        {user
          ? vsprintf(labels.checking_again, [
              seconds,
              `second${seconds === 1 ? '' : 's'}`,
            ])
          : warnings.must_be_signed_in}
      </Text>
      {!user && (
        <View
          style={{
            marginTop: 32,
            width: '75%',
          }}
        >
          <SignInButtons />
        </View>
      )}
    </BlurView>
  );
}
