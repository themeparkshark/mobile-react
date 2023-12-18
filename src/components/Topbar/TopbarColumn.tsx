import { ReactElement } from 'react';
import { View } from 'react-native';

export default function TopbarColumn({
  children,
  stretch = true,
}: {
  readonly children?: ReactElement;
  readonly stretch?: boolean;
}) {
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
      {children && children}
    </View>
  );
}
