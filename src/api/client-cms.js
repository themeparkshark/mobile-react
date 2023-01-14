import axios from 'axios';

const client = axios.create({
  baseURL: 'https://themeparkshark.com/api',
});

export default client;
