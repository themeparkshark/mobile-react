import axios from 'axios';
import * as Device from 'expo-device';
import config from '../config';

const client = axios.create({
  baseURL: config.apiUrl,
});

client.defaults.headers.common['Device-Name'] = Device.deviceName;
client.defaults.headers.common['Is-Device'] = Device.isDevice;
client.defaults.headers.common['Manufacturer'] = Device.manufacturer;
client.defaults.headers.common['Model-Name'] = Device.modelName;
client.defaults.headers.common['OS-Version'] = Device.osVersion;

export default client;
