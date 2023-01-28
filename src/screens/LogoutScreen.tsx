import { Dimensions } from 'react-native';
import { Image } from 'expo-image';
import { useContext, useEffect } from 'react';
import { AuthContext } from '../context/AuthProvider';

export default function LogoutScreen() {
  const { logout } = useContext(AuthContext);

  useEffect(() => {
    logout();
  }, []);

  return (
    <Image
      source={require('../../assets/images/screens/login/background.png')}
      contentFit="cover"
      style={{
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
      }}
    />
  );
}
