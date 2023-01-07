import { Image, ImageURISource, Text, View } from 'react-native';

export default function Box({
  background,
  image,
  text,
  number,
  small,
  type,
}: {
  readonly backgroundColor?: string;
  readonly background?: ImageURISource;
  readonly image: ImageURISource;
  readonly number?: number;
  readonly text?: string | number;
  readonly small?: boolean;
  readonly type: 'task' | 'coin' | 'secret_task';
}) {
  const backgrounds = {
    task: '#4cdcff',
    coin: '#ffe7a2',
    secret_task: '#e5d4ff',
  };

  const borders = {
    task: '#0d3249',
    coin: '#3d4a24',
    secret_task: '#4a2a66',
  };

  return (
    <View
      style={{
        height: '100%',
        backgroundColor: backgrounds[type],
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderColor: borders[type],
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
            backgroundColor: 'rgba(0, 0, 0, .6)',
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
