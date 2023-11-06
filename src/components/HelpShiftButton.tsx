import * as WebBrowser from 'expo-web-browser';
import { Image } from 'react-native';
import Button from './Button';

export default function HelpShiftButton({ url }: { readonly url: string }) {
  return (
    <Button
      onPress={async () => {
        await WebBrowser.openBrowserAsync(url);
      }}
    >
      <Image
        style={{
          width: 35,
          height: 35,
          alignSelf: 'center',
        }}
        resizeMode="contain"
        source={require('../../assets/images/faq.png')}
      />
    </Button>
  );
}
