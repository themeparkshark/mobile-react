import { Dimensions, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useContext, useEffect } from 'react';
import recordActivity from '../api/endpoints/activities/create';
import { AuthContext } from '../context/AuthProvider';

export default function ErrorScreen() {
  const { logout } = useContext(AuthContext);

  useFocusEffect(
    useCallback(() => {
      recordActivity('Viewed the Error screen.');
    }, [])
  );

  useEffect(() => {
    logout();
  }, []);

  return (
    <Image
      source={require('../../assets/images/screens/login/background.png')}
      resizeMode={'cover'}
      style={{
        width: Dimensions.get('window').width,
        height: Dimensions.get('window').height,
      }}
    />
  );
}
