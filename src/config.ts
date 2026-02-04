import Constants from 'expo-constants';

const config = {
  apiUrl: Constants?.expoConfig?.extra?.apiUrl,
  primary: '#09268f',
  secondary: '#00a5f5',
  tertiary: '#fec90e',
  lightBlue: '#dbf1ff',
  red: '#ff0000',
};

console.log('🦈 API URL:', config.apiUrl);

export default config;
