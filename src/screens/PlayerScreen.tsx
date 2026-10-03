import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useState } from 'react';
import { ImageBackground, Pressable } from 'react-native';
import { Alert, Dimensions, ScrollView, Text, View } from 'react-native';
import { vsprintf } from 'sprintf-js';
import getPlayer from '../api/endpoints/players/get';
import reportPlayer from '../api/endpoints/players/report';
import getVisitedParks from '../api/endpoints/players/visited-parks';
import Experience from '../components/Experience';
import FeaturedRideCoinCard from '../components/FeaturedRideCoinCard';
import Heading from '../components/Heading';
import Loading from '../components/Loading';
import Playercard from '../components/Playercard';
import Stats from '../components/Stats';
import ProfileShortcuts, { type ProfileShortcut } from '../components/profile/ProfileShortcuts';
import StatusBadges from '../components/profile/StatusBadges';
import TitlePill from '../components/profile/TitlePill';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import VisitedParks from '../components/VisitedParks';
import { AuthContext } from '../context/AuthProvider';
import useCompliment from '../hooks/useCompliment';
import useCrumbs from '../hooks/useCrumbs';
import useFriends from '../hooks/useFriends';
import usePermissions from '../hooks/usePermissions';
import usePurchaseItem from '../hooks/usePurchaseItem';
import { ParkType } from '../models/park-type';
import { PermissionEnums } from '../models/permission-enums';
import { PlayerType } from '../models/player-type';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ParamListBase } from '@react-navigation/native';

export default function PlayerScreen({ route, navigation }: NativeStackScreenProps<ParamListBase, 'Player'>) {
  const { player } = route.params as { player: number };
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerType>();
  const [parks, setParks] = useState<ParkType[]>([]);
  const { purchaseItem, purchaseModal } = usePurchaseItem();
  const [isFriend, setIsFriend] = useState<boolean>(false);
  const { addFriend, removeFriend, acceptFriend } = useFriends();
  const { complimentPlayer } = useCompliment();
  const { checkPermission, hasPermission } = usePermissions();
  const [failed, setFailed] = useState(false);
  const { player: authPlayer } = useContext(AuthContext);
  const { prompts, messages } = useCrumbs();

  useFocusEffect(
    useCallback(() => {
      if (authPlayer?.id === player) {
        navigation.navigate('Profile');
        return;
      }
    }, [])
  );

  const load = useCallback(async () => {
    setLoading(true);
    setFailed(false);
    try {
      setCurrentPlayer(await getPlayer(player));
    } catch {
      setFailed(true);
      setLoading(false);
      return;
    }
    // Parks are a bonus: the page still opens without them.
    try {
      setParks(await getVisitedParks(player));
    } catch {
      setParks([]);
    }
    setLoading(false);
  }, [player]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!currentPlayer) {
      return;
    }

    setIsFriend(currentPlayer.is_friend);
  }, [currentPlayer]);

  const report = () => {
    if (!currentPlayer || !checkPermission(PermissionEnums.CreateReports)) return;
    Alert.alert(
      vsprintf(prompts.report_username, [currentPlayer.screen_name]),
      '',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Ok',
          onPress: async () => {
            await reportPlayer(currentPlayer.id);
            Alert.alert(messages.report_created, '', [{ text: 'Ok' }]);
          },
        },
      ]
    );
  };

  const actions: ProfileShortcut[] = currentPlayer
    ? [
        ...(currentPlayer.mascot ? [{
          key: 'gift',
          label: 'Gift',
          image: require('../../assets/images/screens/player/gift.png'),
          hint: `Sends ${currentPlayer.screen_name} a gift`,
          locked: !hasPermission(PermissionEnums.RedeemMascotGifts),
          onPress: async () => {
            if (checkPermission(PermissionEnums.RedeemMascotGifts)) {
              await purchaseItem(currentPlayer.mascot.item);
            }
          },
        }] : []),
        isFriend ? {
          key: 'remove-friend',
          label: 'Unfriend',
          image: require('../../assets/images/screens/friends/remove_friend.png'),
          hint: `Removes ${currentPlayer.screen_name} from your friends`,
          onPress: () => {
            removeFriend(currentPlayer, () => setIsFriend(false));
          },
        } : {
          key: 'add-friend',
          label: currentPlayer.has_friend_request_from ? 'Accept' : 'Add Friend',
          image: require('../../assets/images/screens/friends/add_friend.png'),
          hint: currentPlayer.has_friend_request_from
            ? `Accepts ${currentPlayer.screen_name}'s friend request`
            : `Sends ${currentPlayer.screen_name} a friend request`,
          locked: !hasPermission(PermissionEnums.AddFriends),
          onPress: async () => {
            if (checkPermission(PermissionEnums.AddFriends)) {
              currentPlayer?.has_friend_request_from
                ? acceptFriend(currentPlayer)
                : addFriend(currentPlayer);
            }
          },
        },
        {
          key: 'compliment',
          label: 'Compliment',
          image: require('../../assets/images/screens/player/compliment.png'),
          hint: `Sends ${currentPlayer.screen_name} a compliment`,
          locked: !hasPermission(PermissionEnums.CreateCompliments),
          onPress: async () => {
            if (checkPermission(PermissionEnums.CreateCompliments)) {
              await complimentPlayer(currentPlayer);
            }
          },
        },
      ]
    : [];

  return (
    <>
      {purchaseModal}
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton />
        </TopbarColumn>
        <TopbarColumn>
          <TopbarText>{currentPlayer?.screen_name}</TopbarText>
        </TopbarColumn>
        <TopbarColumn stretch={false} />
      </Topbar>
      {loading && <Loading />}
      {!loading && failed && (
        <Loading state="error" message="This shark's page didn't load." onRetry={() => { void load(); }} />
      )}
      {!loading && currentPlayer && (
        <ScrollView
          style={{
            flex: 1,
            marginTop: -8,
          }}
        >
          <View
            style={{
              paddingBottom: 56,
            }}
          >
            <ImageBackground
              source={currentPlayer.inventory?.background_item?.paper_url ? {
                uri: currentPlayer.inventory.background_item.paper_url,
              } : require('../../assets/images/seaweed_background.png')}
              resizeMode="cover"
              style={{
                height: 315,
                overflow: 'hidden',
                position: 'relative',
              }}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`${currentPlayer.screen_name}'s shark`}
            >
              <Playercard
                showBackground={false}
                inventory={currentPlayer.inventory}
                style={{
                  position: 'absolute',
                  width: Dimensions.get('window').width,
                  height: 455,
                  marginTop: -55,
                }}
              />
            </ImageBackground>
            <View
              style={{
                backgroundColor: '#dff4ff',
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 14,
              }}
            >
              {!!currentPlayer.title && (
                <View style={{ marginBottom: 12 }}>
                  <TitlePill title={currentPlayer.title} />
                </View>
              )}
              {!!currentPlayer.featured_ride_coin && (
                <FeaturedRideCoinCard coin={currentPlayer.featured_ride_coin} />
              )}
              <View style={{ paddingTop: 4 }}>
                <Experience player={currentPlayer} own={false} />
              </View>
              <View style={{ marginTop: 18 }}>
                <ProfileShortcuts items={actions} />
              </View>
              <StatusBadges isVip={!!currentPlayer.is_subscribed} isVerified={!!currentPlayer.verified_at} own={false} />
              <Heading text="Statistics" />
              <Stats player={currentPlayer} />
              {parks.length > 0 && (
                <>
                  <Heading text="Visited Parks" />
                  <View
                    style={{
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      borderRadius: 18,
                      padding: 16,
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.08,
                      shadowRadius: 8,
                      elevation: 3,
                    }}
                  >
                    <VisitedParks parks={parks} player={currentPlayer} />
                  </View>
                </>
              )}
              {Boolean(currentPlayer.username) && (
                <Pressable
                  onPress={report}
                  accessibilityRole="button"
                  accessibilityLabel={`Report ${currentPlayer.screen_name}`}
                  style={{ alignSelf: 'center', marginTop: 28, minHeight: 44, paddingHorizontal: 16,
                    justifyContent: 'center' }}
                >
                  <Text style={{ fontFamily: 'Knockout', fontSize: 16, color: '#526477',
                    textDecorationLine: 'underline' }}>
                    Report this player
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </>
  );
}
