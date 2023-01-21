import { Text, View } from 'react-native';

export default function Heading({ text }: { readonly text: string }) {
  return (
    <View
      style={{
        position: 'relative',
        width: '100%',
        marginTop: 32,
        marginBottom: 16,
        flexDirection: 'row',
        marginLeft: 0,
      }}
    >
      <View
        style={{
          backgroundColor: 'rgba(0, 0, 0, .4)',
          height: 2,
          position: 'absolute',
          width: '100%',
          top: '50%',
        }}
      />
      <View
        style={{
          backgroundColor: '#e2e8f0',
          borderRadius: 6,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 18,
            textAlign: 'center',
            textTransform: 'uppercase',
            paddingTop: 8,
            paddingBottom: 8,
            paddingLeft: 12,
            paddingRight: 12,
            color: '#334155',
          }}
        >
          {text}
        </Text>
      </View>
    </View>
  );
}
