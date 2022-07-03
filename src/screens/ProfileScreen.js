import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, Image, View } from 'react-native';
import getMe from '../api/endpoints/me/me';
import getParks from '../api/endpoints/me/visited-parks';
import getInventory from '../api/endpoints/me/inventory';
import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import Progress from '../components/Progress';
import Playercard from '../components/Playercard';

export default function NewsScreen({ navigation }) {
  const [user, setUser] = useState(null);
  const [parks, setParks] = useState(null);
  const [inventory, setInventory] = useState(null);

  useEffect(() => {
    getMe().then((response) => setUser(response));
    getParks().then((response) => setParks(response));
    getInventory().then((response) => setInventory(response));
  }, []);

  return (
    <Wrapper>
      <Topbar text={user?.username} />
      <ScrollView>
        { inventory && (
          <View
            style={{
              height: 350,
              overflow: 'hidden',
              position: 'relative',
            }}
          >
            <Playercard
              inventory={inventory}
              style={{
                position: 'absolute',
                marginTop: -70,
              }}
            />
          </View>
        )}
        <View
          style={{
            borderTopStyle: 'solid',
            borderTopWidth: 5,
            borderTopColor: 'blue',
            paddingLeft: 64,
            paddingRight: 64,
            paddingTop: 32,
          }}
        >
          <Text>Level: {user?.experience_level.level}</Text>
          <Progress progress={user?.experience / user?.experience_level.experience * 100} />
          <Text>
            {user?.experience} / {user?.experience_level.experience} XP
          </Text>
          <Text style={{ fontWeight: 'bold' }}>Total activity</Text>
          <Text>Total shark coins earned: {user?.total_coins}</Text>
          <Text>Shark coin balance: {user?.coins}</Text>
          <Text>Parks visited: {parks?.length}</Text>
          <Text>Total XP: {user?.total_experience}</Text>
        </View>
        <View
          style={{
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 16,
          }}
        >
          {parks?.map((park) => {
            return (
              <Pressable
                key={park.id}
                onPress={() =>
                  navigation.navigate('Park', { park: park.id })
                }
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingTop: 16,
                  paddingBottom: 16,
                }}
              >
                <Image
                  source={{
                    uri: park.image_url
                  }}
                  style={{
                    width: 100,
                    height: 100,
                    resizeMode: 'cover',
                    borderRadius: 20,
                  }}
                />
                <View
                  style={{
                    flex: 1,
                    paddingLeft: 24,
                  }}
                >
                  <Text style={{ paddingBottom: 8 }}>
                    {park.name}
                  </Text>
                  <Progress progress={park.completion_rate} />
                  <Text style={{ paddingTop: 8 }}>
                    {park.completion_rate}% complete
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </Wrapper>
  );
}
