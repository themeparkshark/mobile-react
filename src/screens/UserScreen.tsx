import { Dimensions, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useContext, useEffect, useState } from 'react';
import { useAsyncEffect } from 'rooks';
import getUser from '../api/endpoints/users/get';
import getVisitedParks from '../api/endpoints/users/visited-parks';
import Experience from '../components/Experience';
import Heading from '../components/Heading';
import Loading from '../components/Loading';
import Playercard from '../components/Playercard';
import Stats from '../components/Stats';
import Topbar from '../components/Topbar';
import UserButtons from '../components/UserButtons';
import Verified from '../components/Verified';
import VisitedParks from '../components/VisitedParks';
import config from '../config';
import { MusicContext } from '../context/MusicProvider';
import useCompliment from '../hooks/useCompliment';
import useFriends from '../hooks/useFriends';
import usePurchaseItem from '../hooks/usePurchaseItem';
import { ParkType } from '../models/park-type';
import { UserType } from '../models/user-type';

export default function UserScreen({ route }) {
  const { user } = route.params;
  const [loading, setLoading] = useState<boolean>(true);
  const [currentUser, setCurrentUser] = useState<UserType>();
  const [parks, setParks] = useState<ParkType[]>([]);
  const { purchaseItem } = usePurchaseItem();
  const [isFriend, setIsFriend] = useState<boolean>(false);
  const { addFriend, removeFriend, acceptFriend } = useFriends();
  const { playMusic } = useContext(MusicContext);
  const { complimentUser } = useCompliment();

  useFocusEffect(
    useCallback(() => {
      playMusic(require('../../assets/sounds/music/track5.mp3'));
    }, [])
  );

  useAsyncEffect(async () => {
    setLoading(true);
    setCurrentUser(await getUser(user));
    setParks(await getVisitedParks(user));
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      return;
    }

    setIsFriend(currentUser.is_friend);
  }, [currentUser]);

  const buttons = currentUser
    ? [
        {
          image: require('../../assets/images/screens/user/gift.png'),
          onPress: () => {
            purchaseItem(currentUser.mascot.item);
          },
          show: !!currentUser.mascot,
          text: 'Gift',
        },
        {
          image: require('../../assets/images/screens/friends/remove_friend.png'),
          onPress: () => {
            removeFriend(currentUser, () => setIsFriend(false));
          },
          show: isFriend,
          text: 'Remove friend',
        },
        {
          image: require('../../assets/images/screens/friends/add_friend.png'),
          onPress: () => {
            if (currentUser?.has_friend_request_from) {
              acceptFriend(currentUser);
            } else {
              addFriend(currentUser);
            }
          },
          show: !isFriend,
          text: 'Add friend',
        },
        {
          image: require('../../assets/images/screens/user/compliment.png'),
          onPress: async () => {
            complimentUser(currentUser);
          },
          show: true,
          text: 'Compliment',
        },
      ]
    : [];

  return (
    <>
      <Topbar text={currentUser?.screen_name} showBackButton={true} />
      {loading && <Loading />}
      {!loading && currentUser && (
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
                inventory={currentUser.inventory}
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
              <Experience user={currentUser} />
              <UserButtons buttons={buttons} />
              {currentUser.verified_at && <Verified />}
              <Heading text="Statistics" />
              <Stats user={currentUser} />
              {parks.length > 0 && (
                <>
                  <Heading text="Visited Parks" />
                  <VisitedParks parks={parks} user={currentUser} />
                </>
              )}
            </View>
          </View>
        </ScrollView>
      )}
    </>
  );
}
