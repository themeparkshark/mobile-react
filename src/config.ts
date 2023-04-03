import Constants from 'expo-constants';

const config = {
  apiUrl: Constants?.manifest?.extra?.apiUrl,
  primary: '#09268f',
  pusherKey: Constants?.manifest?.extra?.pusherKey,
  secondary: '#00a5f5',
  tertiary: '#fec90e',
  lightBlue: '#dbf1ff',
};

export default config;
