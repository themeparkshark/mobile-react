import { Text } from 'react-native';

export default function TopbarText({ children }) {
  return (
    <Text
      numberOfLines={1}
      adjustsFontSizeToFit={true}
      style={{
        textAlign: 'center',
        fontSize: 38,
        color: 'white',
        fontFamily: 'Shark',
        textTransform: 'uppercase',
        textShadowColor: 'rgba(0, 0, 0, .5)',
        textShadowOffset: {
          width: 2,
          height: 2,
        },
        textShadowRadius: 0,
        paddingLeft: 12,
        paddingRight: 12,
      }}
    >
      {children}
    </Text>
  );
}
