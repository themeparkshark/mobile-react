import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { vsprintf } from 'sprintf-js';
import * as RootNavigation from '../RootNavigation';
import useCrumbs from '../hooks/useCrumbs';
import { ParkType } from '../models/park-type';
import { PlayerType } from '../models/player-type';
import Progress from './Progress';
import GameIcon from '../ui/GameIcon';

function ParkArtwork({ uri }: { readonly uri?: string | null }) {
  const [unavailable, setUnavailable] = useState(!uri);
  useEffect(() => setUnavailable(!uri), [uri]);
  return <View accessible={false} style={{ width: 100, height: 100, borderRadius: 20,
    overflow: 'hidden', backgroundColor: '#E8F5FC', alignItems: 'center', justifyContent: 'center' }}>
    {/* Neutral park art (a ride car) when the park photo is missing, never a castle. */}
    {unavailable ? <GameIcon name="ride" size={70} /> : <Image source={uri}
      onError={() => setUnavailable(true)} style={{ width: 100, height: 100 }} contentFit="cover" />}
  </View>;
}

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
            color: '#05346e',
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
                accessibilityRole="button"
                accessibilityLabel={`${park.name}. ${rideCoinProgress
                  ? `${park.ride_coins_collected ?? 0} of ${park.ride_coins_available} ride coins`
                  : `${park.completion_rate} percent complete`}. Open collection.`}
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
                <ParkArtwork uri={park.image_url} />
                <View
                  style={{
                    flex: 1,
                    paddingLeft: 16,
                  }}
                >
                  <Text
                    style={{
                      paddingBottom: 8,
                      fontFamily: 'Knockout',
                      textTransform: 'uppercase',
                      fontSize: 16,
                      color: '#174D76',
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
                      color: '#46617A',
                    }}
                  >
                    {rideCoinProgress
                      ? `${park.ride_coins_collected ?? 0}/${park.ride_coins_available} COINS`
                      : vsprintf(labels.park_completion_rate || '%s%% complete', [park.completion_rate])}
                  </Text>
                </View>
                <View style={{ marginLeft: 8 }}><GameIcon name="arrow" size={28} /></View>
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}
