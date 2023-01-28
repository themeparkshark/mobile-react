import axios from 'axios';
import config from '../config';
import * as RootNavigation from '../RootNavigation';
import * as Device from 'expo-device';

const client = axios.create({
  baseURL: config.apiUrl,
});

client.defaults.headers.common['Device-Name'] = Device.deviceName;
client.defaults.headers.common['Is-Device'] = Device.isDevice;
client.defaults.headers.common['Manufacturer'] = Device.manufacturer;
client.defaults.headers.common['Model-Name'] = Device.modelName;
client.defaults.headers.common['OS-Version'] = Device.osVersion;

client.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response.status === 401) {
      return RootNavigation.navigate('Logout');
    }

    throw error;
  }
);

export default client;
