import { StyleSheet, Text, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';

export default function Wrapper({ children }) {
  return (
    <View style={{ flex: '1 1 0%' }}>
      <View style={{ flex: '1 1 0%' }}>{children}</View>
      <View
        style={{
          display: 'flex',
          flexDirection: 'row',
          backgroundColor: 'white',
          paddingTop: 32,
          paddingBottom: 48,
        }}
      >
        <View style={styles.toolbarItem}>
          <Text
            style={styles.toolbarText}
            onPress={() => {
              RootNavigation.navigate('News');
            }}
          >
            News
          </Text>
        </View>
        <View style={styles.toolbarItem}>
          <Text
            style={styles.toolbarText}
            onPress={() => {
              RootNavigation.navigate('Explore');
            }}
          >
            Explore
          </Text>
        </View>
        <View style={styles.toolbarItem}>
          <Text
            style={styles.toolbarText}
            onPress={() => {
              RootNavigation.navigate('Profile');
            }}
          >
            Profile
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbarItem: {
    flex: '1 1 0%',
    textAlign: 'center',
  },
  toolbarText: {
    textAlign: 'center',
  },
});
