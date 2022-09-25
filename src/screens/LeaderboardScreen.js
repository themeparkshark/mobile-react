import Wrapper from '../components/Wrapper';
import Topbar from '../components/Topbar';
import RNPickerSelect from 'react-native-picker-select';
import allParks from '../api/endpoints/parks/allParks';
import getLeaderboards from '../api/endpoints/parks/leaderboards/get';
import { useContext, useEffect, useState } from 'react';
import { AuthContext } from '../context/AuthProvider';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Chevron } from 'react-native-shapes';
import Leaderboards from '../components/Leaderboards';

export default function LeaderboardScreen() {
  const { user } = useContext(AuthContext);
  const [parks, setParks] = useState([]);
  const [selectedPark, setSelectedPark] = useState(user.current_park_id);
  const [time, setTime] = useState();
  const [leaderboards, setLeaderboards] = useState([]);

  const requestLeaderboards = async () => {
    const response = await getLeaderboards(selectedPark);
    setLeaderboards(response);
  };

  useEffect(() => {
    (async () => {
      const response = await allParks();
      setParks(response);
      await requestLeaderboards();
    })();
  }, []);

  useEffect(() => {
    requestLeaderboards();
  }, [time]);

  return (
    <Wrapper>
      <Topbar text="Leaderboard" />
      <ScrollView
        style={{
          flex: 1,
          marginTop: -8,
          paddingTop: 24,
        }}
      >
        <View
          style={{
            marginLeft: 16,
            marginRight: 16,
          }}
        >
          <Text style={{textAlign: 'center'}}>Updated hourly</Text>
          <Text>Select a park:</Text>
          <RNPickerSelect
            placeholder={{}}
            onValueChange={(value) => setSelectedPark(value)}
            onDonePress={() => setTime(Date.now())}
            value={selectedPark}
            items={parks.map((item) => {
              return {
                label: item.name,
                value: item.id,
              }
            })}
            style={{
              inputIOS: {
                fontSize: 16,
                paddingVertical: 12,
                paddingHorizontal: 10,
                borderWidth: 1,
                borderColor: 'gray',
                borderRadius: 4,
                color: 'black',
                paddingRight: 30,
              },
              iconContainer: {
                top: 18,
                right: 15,
              },
            }}
            Icon={() => <Chevron size={1.5} color="gray" />}
          />
          <Leaderboards leaderboards={leaderboards} />
        </View>
      </ScrollView>
    </Wrapper>
  );
};
