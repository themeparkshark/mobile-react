/** Dev-only: the hamburger menu over a plain map-blue backdrop (EXPO_PUBLIC_MENU_PREVIEW=1). */
import { View } from 'react-native';
import QuickAccessMenu from '../components/QuickAccessMenu';

export default function MenuPreviewScreen() {
  return (
    <View style={{ flex: 1, backgroundColor: '#bfe5ff' }}>
      <QuickAccessMenu position="left" />
    </View>
  );
}
