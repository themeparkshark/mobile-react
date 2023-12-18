import * as WebBrowser from 'expo-web-browser';
import { useContext, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ImageBackground,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { AdaptyPaywallProduct, adapty } from 'react-native-adapty';
import { useAsyncEffect, useIntervalWhen } from 'rooks';
import { vsprintf } from 'sprintf-js';
import * as RootNavigation from '../RootNavigation';
import Loading from '../components/Loading';
import RedButton from '../components/RedButton';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import YellowButton from '../components/YellowButton';
import { AuthContext } from '../context/AuthProvider';
import useCrumbs from '../hooks/useCrumbs';

export default function MembershipScreen({ route }) {
  const { intro } = route.params ?? {};
  const { warnings, labels, urls } = useCrumbs();
  const [product, setProduct] = useState<AdaptyPaywallProduct>();
  const [loading, setLoading] = useState<boolean>(true);
  const { player, refreshPlayer } = useContext(AuthContext);
  const [startTimer, setStartTimer] = useState<boolean>(false);

  useAsyncEffect(async () => {
    if (!player) {
      return;
    }

    await adapty.activate('public_live_CNR38UxN.UitJJkmc6YkTWeLTRpgH', {
      customerUserId: player.id.toString(),
    });
    const paywall = await adapty.getPaywall('vip_membership');
    const products = await adapty.getPaywallProducts(paywall);

    setProduct(products[0]);
    setLoading(false);
  }, [player]);

  useIntervalWhen(
    async () => {
      const player = await refreshPlayer();

      if (player.is_subscribed) {
        setStartTimer(false);
        Alert.alert(labels.payment_complete);
        RootNavigation.navigate('Profile');
      }
    },
    5000,
    startTimer
  );

  return (
    <>
      {startTimer && (
        <View
          style={{
            position: 'absolute',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, .9)',
            zIndex: 30,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              padding: 32,
            }}
          >
            <ActivityIndicator size="large" color="rgba(255, 255, 255, 1)" />
            <Text
              style={{
                textAlign: 'center',
                paddingTop: 16,
                color: 'white',
              }}
            >
              {labels.processing_payment}
            </Text>
          </View>
        </View>
      )}
      <Topbar>
        <TopbarColumn stretch={false}>{!intro && <BackButton />}</TopbarColumn>
        <TopbarColumn>
          <TopbarText>VIP Membership</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      {loading && <Loading />}
      {!loading && product && (
        <View
          style={{
            marginTop: -8,
            flex: 1,
          }}
        >
          <ImageBackground
            source={require('../../assets/images/membership_background.png')}
            style={{
              flex: 1,
              justifyContent: 'center',
            }}
          >
            <ScrollView>
              <View
                style={{
                  paddingTop: 32,
                  paddingLeft: 16,
                  paddingRight: 16,
                  paddingBottom: 32,
                }}
              >
                <View
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, .8)',
                    marginLeft: 'auto',
                    marginRight: 'auto',
                    padding: 24,
                    borderRadius: 5,
                    marginBottom: 32,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: 'Knockout',
                      textTransform: 'uppercase',
                      textAlign: 'center',
                      fontSize: 32,
                      paddingBottom: 16,
                    }}
                  >
                    {labels.membership}
                  </Text>
                  {labels?.membership_benefits.map((benefit, index) => {
                    return (
                      <View
                        key={index}
                        style={{
                          paddingBottom: 16,
                        }}
                      >
                        <Text
                          style={{
                            fontFamily: 'Knockout',
                            fontSize: 16,
                          }}
                        >
                          {benefit}
                        </Text>
                      </View>
                    );
                  })}
                  <View
                    style={{
                      width: '75%',
                      marginLeft: 'auto',
                      marginRight: 'auto',
                      paddingTop: 8,
                    }}
                  >
                    <YellowButton
                      onPress={async () => {
                        try {
                          await adapty.makePurchase(
                            product as AdaptyPaywallProduct
                          );
                          setStartTimer(true);
                        } catch (error) {
                          Alert.alert(
                            warnings.something_went_wrong,
                            labels.please_try_again,
                            [
                              {
                                text: 'Ok',
                              },
                            ]
                          );
                        }
                      }}
                      text={labels.start_free_trial}
                    />
                  </View>
                  {intro && (
                    <View
                      style={{
                        marginLeft: 'auto',
                        marginRight: 'auto',
                        marginTop: 16,
                        width: '50%',
                      }}
                    >
                      <RedButton
                        onPress={() => {
                          RootNavigation.navigate('Explore');
                        }}
                        text={labels.skip_for_now}
                      />
                    </View>
                  )}
                  <View
                    style={{
                      paddingTop: 24,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: 'Knockout',
                        fontSize: 16,
                        textAlign: 'center',
                      }}
                    >
                      {vsprintf(labels.purchase_membership_additional, [
                        product.price?.currencyCode,
                        product.price?.localizedString,
                      ])}
                    </Text>
                  </View>
                </View>
                <View>
                  <Text
                    style={{
                      fontSize: 18,
                      fontFamily: 'Knockout',
                      color: 'rgba(255, 255, 255, .7)',
                      textAlign: 'center',
                    }}
                  >
                    {vsprintf(labels.membership_terms, [
                      product.price?.currencyCode,
                      product.price?.localizedString,
                    ])}
                  </Text>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingTop: 24,
                    }}
                  >
                    <View>
                      <TouchableOpacity
                        onPress={() => {
                          WebBrowser.openBrowserAsync(urls.terms);
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            fontFamily: 'Knockout',
                            color: 'rgba(255, 255, 255, .7)',
                            textAlign: 'center',
                          }}
                        >
                          Terms
                        </Text>
                      </TouchableOpacity>
                    </View>
                    <View>
                      <TouchableOpacity
                        onPress={() => {
                          WebBrowser.openBrowserAsync(urls.privacy_policy);
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 18,
                            fontFamily: 'Knockout',
                            color: 'rgba(255, 255, 255, .7)',
                            textAlign: 'center',
                          }}
                        >
                          Privacy Policy
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </View>
            </ScrollView>
          </ImageBackground>
        </View>
      )}
    </>
  );
}
