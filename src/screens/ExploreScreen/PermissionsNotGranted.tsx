import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import YellowButton from '../../components/YellowButton';
import { LocationContext } from '../../context/LocationProvider';

/**
 * Location primer. Explains the payoff first, then shows the iOS prompt from a
 * button tap; only after iOS stops asking does the button open Settings.
 */
export default function PermissionsNotGranted() {
  const { requestPermission } = useContext(LocationContext);
  const [asking, setAsking] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <Image source={require('../../../assets/images/screens/welcome/shark.png')}
          style={styles.shark} contentFit="contain" />
        <Text style={styles.title}>Let’s find your first treasures!</Text>
        <Text style={styles.body}>
          Churros, cameras and backpacks pop up around you, even at home. At the park, walk up to a ride to catch its coin.
        </Text>
        <Text style={styles.small}>Your location is only used to place items and rides near you.</Text>
        <View style={{ width: '80%', marginTop: 18 }}>
          <YellowButton text={asking ? 'One sec…' : 'Turn On Location'} onPress={async () => {
            if (asking) return;
            setAsking(true);
            try { await requestPermission(); } finally { setAsking(false); }
          }} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { ...StyleSheet.absoluteFillObject, zIndex: 30, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(3, 38, 92, 0.55)', padding: 24 },
  card: { width: '100%', alignItems: 'center', backgroundColor: '#0768b9', borderRadius: 24,
    borderWidth: 4, borderColor: '#fff', paddingVertical: 22, paddingHorizontal: 18 },
  shark: { width: 170, height: 150, marginTop: -70 },
  title: { fontFamily: 'Shark', fontSize: 28, color: '#ffcf3b', textAlign: 'center',
    textShadowColor: '#7a3d00', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 0 },
  body: { fontFamily: 'Knockout', fontSize: 18, color: '#fff', textAlign: 'center', marginTop: 10, lineHeight: 23 },
  small: { fontFamily: 'Knockout', fontSize: 14, color: '#cdeaff', textAlign: 'center', marginTop: 10 },
});
