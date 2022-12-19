import Constants from 'expo-constants';

export default function asset(path) {
  return `${Constants.manifest.extra.assetsBaseUrl}/${path}`;
}
