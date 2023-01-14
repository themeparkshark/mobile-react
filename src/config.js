import Constants from 'expo-constants';

console.log(Constants.manifest);

let Config = {
  apiUrl: Constants.manifest.extra.apiUrl,
  primary: '#09268f',
  secondary: '#00a5f5',
  tertiary: '#fec90e',
};

export default Config;
