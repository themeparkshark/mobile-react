import axios from 'axios';
import * as Device from 'expo-device';
import config from '../config';

const client = axios.create({
  baseURL: config.apiUrl,
});

client.defaults.headers.common['Device-Name'] = Device.deviceName ?? 'unknown';
client.defaults.headers.common['Is-Device'] = Device.isDevice ?? false;
client.defaults.headers.common['Manufacturer'] = Device.manufacturer ?? 'unknown';
client.defaults.headers.common['Model-Name'] = Device.modelName ?? 'unknown';
client.defaults.headers.common['OS-Version'] = Device.osVersion ?? 'unknown';

export default client;
