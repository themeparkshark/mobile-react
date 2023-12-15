import { FlashList } from '@shopify/flash-list';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import * as RootNavigation from '../../RootNavigation';
import all from '../../api/endpoints/players/all';
import Avatar from '../../components/Avatar';
import Button from '../../components/Button';
import Loading from '../../components/Loading';
import { PlayerType } from '../../models/player-type';

export default function Experience() {
  const [loading, setLoading] = useState<boolean>(true);
  const [players, setPlayers] = useState<PlayerType[]>([]);
  const [page, setPage] = useState<number>(1);

  const fetchPlayers = async (page: number) => {
    const response = await all(page);
    setPlayers((prevState) => {
      return [...prevState, ...response];
    });
  };

  useEffect(() => {
    fetchPlayers(page).then(() => setLoading(false));
  }, []);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchPlayers(page);
    }
  }, [page]);

  return (
    <View style={{ flex: 1 }}>
      {loading && <Loading />}
      {!loading && (
        <View
          style={{
            flex: 1,
          }}
        >
          <FlashList
            contentContainerStyle={{ paddingBottom: 8 }}
            data={players}
            keyExtractor={(player) => player.id.toString()}
            renderItem={({ item, index }) => {
              return (
                <View
                  key={item.id}
                  style={{
                    paddingTop: 25,
                    paddingBottom: 25,
                    borderTopWidth: index === 0 ? 0 : 3,
                    borderColor: 'rgba(0, 0, 0, .4)',
                    flexDirection: 'row',
                    alignItems: 'center',
                  }}
                >
                  <View
                    style={{
                      width: '20%',
                      paddingLeft: 16,
                      paddingRight: 16,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 24,
                        fontFamily: 'Shark',
                        color: 'black',
                      }}
                    >
                      {index + 1}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingLeft: 16,
                      paddingRight: 16,
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                    }}
                  >
                    <Button
                      onPress={() => {
                        RootNavigation.navigate('Player', {
                          player: item.id,
                        });
                      }}
                    >
                      <Avatar size="sm" player={item} />
                    </Button>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 24,
                          fontFamily: 'Shark',
                          color: 'black',
                          textTransform: 'uppercase',
                          paddingLeft: 16,
                        }}
                        numberOfLines={1}
                      >
                        {item.screen_name}
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      paddingLeft: 16,
                      paddingRight: 16,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 24,
                        fontFamily: 'Shark',
                        color: 'black',
                      }}
                    >
                      {item.total_experience}
                    </Text>
                  </View>
                </View>
              );
            }}
            estimatedItemSize={100}
            onEndReached={() => {
              setPage((prevState) => prevState + 1);
            }}
          />
        </View>
      )}
    </View>
  );
}
