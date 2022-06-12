import axios from 'axios';
import Constants from 'expo-constants';

const client = axios.create({
  baseURL: Constants.manifest.extra.apiBaseUrl,
});

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response.status === 401) {
      // logout
    }
  }
);

export default client;
