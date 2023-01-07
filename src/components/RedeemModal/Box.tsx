import { Image, ImageURISource, Text, View } from 'react-native';

export default function Box({
  backgroundColor,
  background,
  image,
  text,
  number,
  small,
}: {
  readonly backgroundColor?: string;
  readonly background?: ImageURISource;
  readonly image: ImageURISource;
  readonly number?: number;
  readonly text?: string | number;
  readonly small?: boolean;
}) {
  return (
    <View
      style={{
        height: '100%',
        backgroundColor: backgroundColor ?? '#aae5fe',
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderColor: '#0d3249',
        borderWidth: 3,
        shadowOffset: {
          width: 0,
          height: 3,
        },
        shadowOpacity: 0.4,
        shadowRadius: 0,
      }}
    >
      <View
        style={{
          flex: 1,
          width: '100%',
          borderTopLeftRadius: 6,
          borderTopRightRadius: 6,
          position: 'relative',
          justifyContent: 'center',
        }}
      >
        <Image
          source={image}
          style={{
            width: '85%',
            height: '85%',
            resizeMode: 'contain',
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        />
        {number && (
          <View
            style={{
              top: 4,
              right: 4,
              position: 'absolute',
            }}
          >
            <Text
              style={{
                textShadowColor: 'black',
                textShadowRadius: 5,
                color: 'white',
                fontFamily: 'Knockout',
                fontSize: 28,
              }}
            >
              {number}
            </Text>
          </View>
        )}
        {background && (
          <Image
            source={background}
            style={{
              width: '100%',
              height: '100%',
              position: 'absolute',
              zIndex: -10,
            }}
            resizeMode="cover"
          />
        )}
      </View>
      {text && (
        <View
          style={{
            backgroundColor: '#2d556a',
            borderBottomLeftRadius: 6,
            borderBottomRightRadius: 6,
            padding: 4,
            width: '100%',
          }}
        >
          <Text
            style={{
              color: 'white',
              textAlign: 'center',
              fontFamily: 'Knockout',
              fontSize: small ? 18 : 24,
            }}
            numberOfLines={1}
            adjustsFontSizeToFit={true}
          >
            {text}
          </Text>
        </View>
      )}
    </View>
  );
}
