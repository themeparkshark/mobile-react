import axios from 'axios';
import config from '../config';

// CMS client - uses same base URL as main API
// Adjust if CMS has a different endpoint
const client = axios.create({
  baseURL: config.apiUrl,
});

export default client;
