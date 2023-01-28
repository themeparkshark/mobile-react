import { Dimensions, ImageBackground, SafeAreaView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import recordActivity from '../api/endpoints/activities/create';
import YellowButton from '../components/YellowButton';
import { Linking } from 'react-native'

export default function ErrorScreen() {
  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Error screen.');
    }, [])
  );

  return (
    <ImageBackground
      source={require('../../assets/images/screens/login/background.png')}
      resizeMode="cover"
      style={{
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
      }}
    >
      <SafeAreaView
        style={{
          flex: 1,
        }}
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: 'white',
              marginLeft: 'auto',
              marginRight: 'auto',
              padding: 32,
              borderRadius: 5,
              width: '100%',
              shadowColor: '#000',
              shadowOffset: {
                width: 3,
                height: 3,
              },
              shadowRadius: 0,
              shadowOpacity: 0.4,
            }}
          >
            <Text
              style={{
                fontFamily: 'Knockout',
                textAlign: 'center',
                fontSize: 24,
                paddingBottom: 16,
              }}
            >Missing Location Permissions</Text>
            <Text style={{
              paddingBottom: 16,
              textAlign: 'center',
            }}>Theme Park Shark requires your location to complete tasks, redeem coins and earn park coins. Please adjust your settings to allow location services.</Text>
            <View style={{
              marginLeft: 'auto',
              marginRight: 'auto',
              paddingBottom: 16,
            }}>
              <Text style={{ paddingBottom: 8 }}>1. Go to Settings > Theme Park Shark.</Text>
              <Text style={{ paddingBottom: 8 }}>2. Tap Location.</Text>
              <Text style={{ paddingBottom: 8 }}>3. Set Allow Location Access to Always.</Text>
              <Text style={{ paddingBottom: 8 }}>4. Set Precise Location to On.</Text>
            </View>
            <View style={{ marginLeft: 'auto', marginRight: 'auto' }}>
              <YellowButton onPress={() => Linking.openURL('app-settings:')} text="Open Settings" />
            </View>
          </View>
        </View>
      </SafeAreaView>
    </ImageBackground>
  );
}
