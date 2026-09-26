import { Image } from 'expo-image';
import { Text, TouchableOpacity, View } from 'react-native';
import { vsprintf } from 'sprintf-js';
import * as RootNavigation from '../RootNavigation';
import useCrumbs from '../hooks/useCrumbs';
import { ParkType } from '../models/park-type';
import { PlayerType } from '../models/player-type';
import Progress from './Progress';

export default function VisitedParks({
  parks,
  player,
}: {
  readonly parks: ParkType[];
  readonly player: PlayerType;
}) {
  const { labels, warnings } = useCrumbs();

  return (
    <View>
      {parks.length === 0 && (
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 20,
            textAlign: 'center',
            paddingBottom: 32,
          }}
        >
          {warnings.no_visited_parks || "You haven't visited any parks yet."}
        </Text>
      )}
      {parks.length > 0 && (
        <View>
          {parks?.map((park) => {
            const rideCoinProgress = typeof park.ride_coins_available === 'number' &&
              park.ride_coins_available > 0 &&
              typeof park.ride_coin_completion_rate === 'number';
            const progress = rideCoinProgress
              ? park.ride_coin_completion_rate! : park.completion_rate;
            return (
              <TouchableOpacity
                key={park.id}
                onPress={() => {
                  RootNavigation.navigate('Park', {
                    park: park.id,
                    player: player.id,
                  });
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingBottom: 16,
                }}
              >
                <Image
                  source={park.image_url}
                  style={{
                    width: 100,
                    height: 100,
                    borderRadius: 20,
                  }}
                  contentFit="cover"
                />
                <View
                  style={{
                    flex: 1,
                    paddingLeft: 24,
                  }}
                >
                  <Text
                    style={{
                      paddingBottom: 8,
                      fontFamily: 'Knockout',
                      textTransform: 'uppercase',
                      fontSize: 16,
                    }}
                  >
                    {park.name}
                  </Text>
                  <Progress progress={progress} />
                  <Text
                    style={{
                      paddingTop: 8,
                      fontFamily: 'Knockout',
                      textTransform: 'uppercase',
                      fontSize: 16,
                    }}
                  >
                    {rideCoinProgress
                      ? `${park.ride_coins_collected ?? 0}/${park.ride_coins_available} RIDE COINS`
                      : vsprintf(labels.park_completion_rate || '%s%% complete', [park.completion_rate])}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}
