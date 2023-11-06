import { Image } from 'expo-image';
import { Text, TouchableOpacity, View } from 'react-native';
import { vsprintf } from 'sprintf-js';
import * as RootNavigation from '../RootNavigation';
import useCrumbs from '../hooks/useCrumbs';
import { ParkType } from '../models/park-type';
import { UserType } from '../models/user-type';
import Progress from './Progress';

export default function VisitedParks({
  parks,
  user,
}: {
  readonly parks: ParkType[];
  readonly user: UserType;
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
          {warnings.no_visited_parks}
        </Text>
      )}
      {parks.length > 0 && (
        <View>
          {parks?.map((park) => {
            return (
              <TouchableOpacity
                key={park.id}
                onPress={() => {
                  RootNavigation.navigate('Park', {
                    park: park.id,
                    user: user.id,
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
                  <Progress progress={park.completion_rate} />
                  <Text
                    style={{
                      paddingTop: 8,
                      fontFamily: 'Knockout',
                      textTransform: 'uppercase',
                      fontSize: 16,
                    }}
                  >
                    {vsprintf(labels.park_completion_rate, [
                      park.completion_rate,
                    ])}
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
