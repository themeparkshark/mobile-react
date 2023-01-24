import {Image, Text, View} from 'react-native';

export default function Verified() {
  return (
      <View
        style={{
          marginTop: 32,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Image
          source={require('../../assets/images/screens/profile/verified.png')}
          style={{
            width: 30,
            height: 30,
            resizeMode: 'contain',
          }}
        />
        <View
          style={{
            paddingLeft: 16,
          }}
        >
          <Text
            style={{
              fontFamily: 'Knockout',
              textTransform: 'uppercase',
              fontSize: 16,
            }}
          >
            This is a notable and verified user.
          </Text>
        </View>
      </View>
  );
}
