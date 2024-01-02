import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useState } from 'react';
import { Alert, Dimensions, ScrollView, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import { vsprintf } from 'sprintf-js';
import getPlayer from '../api/endpoints/players/get';
import reportPlayer from '../api/endpoints/players/report';
import getVisitedParks from '../api/endpoints/players/visited-parks';
import Experience from '../components/Experience';
import Heading from '../components/Heading';
import Loading from '../components/Loading';
import ButtonRow from '../components/ButtonRow';
import Playercard from '../components/Playercard';
import Stats from '../components/Stats';
import Subscribed from '../components/Subscribed';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import TopbarText from '../components/Topbar/TopbarText';
import Verified from '../components/Verified';
import VisitedParks from '../components/VisitedParks';
import config from '../config';
import { AuthContext } from '../context/AuthProvider';
import useCompliment from '../hooks/useCompliment';
import useCrumbs from '../hooks/useCrumbs';
import useFriends from '../hooks/useFriends';
import usePermissions from '../hooks/usePermissions';
import usePurchaseItem from '../hooks/usePurchaseItem';
import { ParkType } from '../models/park-type';
import { PermissionEnums } from '../models/permission-enums';
import { PlayerType } from '../models/player-type';
import * as RootNavigation from "../RootNavigation";

export default function PlayerScreen({ route, navigation }) {
  const { player } = route.params;
  const [loading, setLoading] = useState<boolean>(true);
  const [currentPlayer, setCurrentPlayer] = useState<PlayerType>();
  const [parks, setParks] = useState<ParkType[]>([]);
  const { purchaseItem } = usePurchaseItem();
  const [isFriend, setIsFriend] = useState<boolean>(false);
  const { addFriend, removeFriend, acceptFriend } = useFriends();
  const { complimentPlayer } = useCompliment();
  const { checkPermission } = usePermissions();
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

  useAsyncEffect(async () => {
    setLoading(true);
    setCurrentPlayer(await getPlayer(player));
    setParks(await getVisitedParks(player));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!currentPlayer) {
      return;
    }

    setIsFriend(currentPlayer.is_friend);
  }, [currentPlayer]);

  const buttons = currentPlayer
    ? [
        {
          image: require('../../assets/images/screens/explore/base.png'),
          onPress: () => {
            RootNavigation.navigate('PinCollections');
          },
          text: 'Badges',
        },
        {
          image: require('../../assets/images/screens/player/gift.png'),
          onPress: async () => {
            if (checkPermission(PermissionEnums.RedeemMascotGifts)) {
              await purchaseItem(currentPlayer.mascot.item);
            }
          },
          show: !!currentPlayer.mascot,
          text: 'Gift',
          permission: PermissionEnums.RedeemMascotGifts,
        },
        {
          image: require('../../assets/images/screens/friends/remove_friend.png'),
          onPress: () => {
            removeFriend(currentPlayer, () => setIsFriend(false));
          },
          show: isFriend,
          text: 'Remove friend',
        },
        {
          image: require('../../assets/images/screens/friends/add_friend.png'),
          onPress: async () => {
            if (checkPermission(PermissionEnums.AddFriends)) {
              currentPlayer?.has_friend_request_from
                ? acceptFriend(currentPlayer)
                : addFriend(currentPlayer);
            }
          },
          show: !isFriend,
          text: 'Add friend',
          permission: PermissionEnums.AddFriends,
        },
        {
          image: require('../../assets/images/screens/player/compliment.png'),
          onPress: async () => {
            if (checkPermission(PermissionEnums.CreateCompliments)) {
              await complimentPlayer(currentPlayer);
            }
          },
          text: 'Compliment',
          permission: PermissionEnums.CreateCompliments,
        },
        {
          show: Boolean(currentPlayer.username),
          image: require('../../assets/images/screens/explore/base.png'),
          onPress: async () => {
            if (checkPermission(PermissionEnums.CreateReports)) {
              Alert.alert(
                vsprintf(prompts.report_username, [currentPlayer.screen_name]),
                '',
                [
                  {
                    text: 'Cancel',
                    style: 'cancel',
                  },
                  {
                    text: 'Ok',
                    onPress: async () => {
                      await reportPlayer(currentPlayer.id);

                      Alert.alert(messages.report_created, '', [
                        {
                          text: 'Ok',
                        },
                      ]);
                    },
                  },
                ]
              );
            }
          },
          text: 'Report',
          permission: PermissionEnums.CreateReports,
        },
      ]
    : [];

  return (
    <>
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
      {!loading && currentPlayer && (
        <ScrollView
          style={{
            flex: 1,
            marginTop: -8,
          }}
        >
          <View
            style={{
              paddingBottom: 32,
            }}
          >
            <View
              style={{
                height: 315,
                overflow: 'hidden',
                position: 'relative',
              }}
            >
              <Playercard
                inventory={currentPlayer.inventory}
                style={{
                  position: 'absolute',
                  width: Dimensions.get('window').width,
                  height: 455,
                  marginTop: -55,
                }}
              />
            </View>
            <View
              style={{
                borderTopWidth: 5,
                borderTopColor: config.primary,
                paddingLeft: 16,
                paddingRight: 16,
                paddingTop: 24,
              }}
            >
              <Experience player={currentPlayer} />
              <ButtonRow buttons={buttons} />
              {currentPlayer.is_subscribed && <Subscribed />}
              {currentPlayer.verified_at && <Verified />}
              <Heading text="Statistics" />
              <Stats player={currentPlayer} />
              {parks.length > 0 && (
                <>
                  <Heading text="Visited Parks" />
                  <VisitedParks parks={parks} player={currentPlayer} />
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </>
  );
}
