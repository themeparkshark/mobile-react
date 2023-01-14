import axios from 'axios';
import config from '../config';
import * as RootNavigation from '../RootNavigation';

const client = axios.create({
  baseURL: config.apiUrl,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response.status === 401) {
      // send to login screen
    }

    if (error.response.status >= 500) {
      return RootNavigation.navigate('Error');
    }

    throw error;
  }
);

export default client;
