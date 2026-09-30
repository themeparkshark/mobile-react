import axios from 'axios';
import * as Device from 'expo-device';
import config from '../config';

const client = axios.create({
  baseURL: config.apiUrl,
  // Park connectivity can be poor; callers need a bounded failure so retry
  // and offline states appear instead of an indefinite loading screen.
  timeout: 12000,
});

// Device-Name is deliberately not sent: on iOS it is the owner's chosen
// device name (often their real name), which the API does not need.
client.defaults.headers.common['Is-Device'] = Device.isDevice ?? false;
client.defaults.headers.common['Manufacturer'] = Device.manufacturer ?? 'unknown';
client.defaults.headers.common['Model-Name'] = Device.modelName ?? 'unknown';
client.defaults.headers.common['OS-Version'] = Device.osVersion ?? 'unknown';

export default client;
