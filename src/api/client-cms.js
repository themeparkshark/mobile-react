import axios from 'axios';
import Constants from 'expo-constants';

const client = axios.create({
  baseURL: Constants.manifest.extra.cmsBaseUrl,
});

export default client;
