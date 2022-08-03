import axios from 'axios';
import Constants from 'expo-constants';
import * as RootNavigation from '../RootNavigation';
import Toast from 'react-native-root-toast';

const client = axios.create({
  baseURL: Constants.manifest.extra.apiBaseUrl,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response.status === 422) {
      Toast.show(error.response.data.message, {
        duration: Toast.durations.LONG,
        position: Toast.positions.BOTTOM,
        animation: true,
        delay: 0,
      });
    }

    if (error.response.status >= 500) {
      return RootNavigation.navigate('Error');
    }

    throw error;
  }
);

export default client;
