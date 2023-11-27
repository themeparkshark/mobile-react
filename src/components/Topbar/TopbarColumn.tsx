import { View } from 'react-native';

export default function TopbarColumn({ children, stretch = true }) {
  return (
    <View
      style={{
        flex: stretch ? 1 : 0,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        minWidth: 35,
      }}
    >
      {children}
    </View>
  );
}
