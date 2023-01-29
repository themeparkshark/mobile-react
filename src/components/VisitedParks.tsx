import { ParkType } from '../models/park-type';
import { Text, TouchableOpacity, View } from 'react-native';
import Progress from './Progress';
import { Image } from 'expo-image';
import * as RootNavigation from '../RootNavigation';
import { UserType } from '../models/user-type';

export default function VisitedParks({
  parks,
  user,
}: {
  readonly parks: ParkType[];
  readonly user: UserType;
}) {
  return (
    <View>
      {parks.length === 0 && (
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 20,
            textAlign: 'center',
          }}
        >
          You haven't visited any parks yet.
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
                    {park.completion_rate}% complete
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
