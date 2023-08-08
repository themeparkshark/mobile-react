import * as WebBrowser from 'expo-web-browser';
import {
  ImageBackground,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Topbar from '../components/Topbar';
import YellowButton from '../components/YellowButton';
import useCrumbs from '../hooks/useCrumbs';

export default function MembershipScreen() {
  const { labels, urls } = useCrumbs();

  return (
    <>
      <Topbar text="VIP Membership" showBackButton />
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
          <ScrollView
            style={{
              flex: 1,
              padding: 32,
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
                <YellowButton onPress={() => {}} text="Start Free Trial" />
              </View>
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
                  {labels.purchase_membership_additional}
                </Text>
              </View>
            </View>
            <View>
              <View
                style={{
                  paddingBottom: 24,
                  width: '50%',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}
              >
                <YellowButton onPress={() => {}} text="Restore purchases" />
              </View>
              <Text
                style={{
                  fontSize: 18,
                  fontFamily: 'Knockout',
                  color: 'rgba(255, 255, 255, .7)',
                  textAlign: 'center',
                }}
              >
                {labels.membership_terms}
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
          </ScrollView>
        </ImageBackground>
      </View>
    </>
  );
}
