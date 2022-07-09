import axios from 'axios';
import Constants from 'expo-constants';
import * as RootNavigation from '../RootNavigation';

const client = axios.create({
  baseURL: Constants.manifest.extra.apiBaseUrl,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response.status === 401) {
      // logout
    }

    if (error.response.status >= 500) {
      return RootNavigation.navigate('Error');
    }
  }
);

export default client;
