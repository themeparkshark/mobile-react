import Constants from 'expo-constants';
import { Image } from 'expo-image';
import { ReactElement, ReactNode, useContext } from 'react';
import { Dimensions, ImageBackground, SafeAreaView, View } from 'react-native';
import * as RootNavigation from '../RootNavigation';
import Button from '../components/Button';
import { ThemeContext } from '../context/ThemeProvider';
import Broadcasts from './Broadcasts';

export function BackButton({ onPress }: { readonly onPress?: () => void }) {
  return (
    <Button
      onPress={async () => {
        if (onPress) {
          await onPress();
        }

        RootNavigation.goBack();
      }}
    >
      <Image
        source={require('../../assets/images/screens/explore/back.png')}
        style={{
          width: 35,
          height: 35,
        }}
        contentFit="contain"
      />
    </Button>
  );
}

export default function Topbar({
  children,
}: {
  readonly children: ReactElement[];
  readonly informationModalId?: number | null;
  readonly rightButton?: ReactNode | null;
  readonly leftButton?: ReactNode | null;
  readonly text?: string | null;
  readonly showBackButton?: boolean;
  readonly showCurrencies?: boolean;
  readonly parkCoin?: string | null;
  readonly parkCoins?: number | null;
}) {
  const { theme } = useContext(ThemeContext);

  return (
    <View
      style={{
        width: Dimensions.get('window').width,
        zIndex: 20,
        position: 'relative',
      }}
    >
      <SafeAreaView
        style={{
          marginTop: Constants.statusBarHeight,
          position: 'absolute',
        }}
      >
        <Broadcasts />
      </SafeAreaView>
      <ImageBackground
        source={{ uri: theme?.top_bar_url }}
        resizeMode="cover"
        style={{
          height: 70 + Constants.statusBarHeight,
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <SafeAreaView>
          <View
            style={{
              paddingLeft: 12,
              paddingRight: 12,
              flexDirection: 'row',
              alignItems: 'center',
              width: Dimensions.get('window').width,
              height: 80,
              columnGap: 8,
            }}
          >
            {children}
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}
