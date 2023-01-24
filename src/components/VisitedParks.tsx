import {ParkType} from '../models/park-type';
import {Image, Text, TouchableOpacity, View} from 'react-native';
import Progress from './Progress';
import * as RootNavigation from '../RootNavigation';

export default function VisitedParks({ parks } : {
  readonly parks: ParkType[];
}) {
  return (
    <View>
      {parks.length === 0 && (
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 20,
            textAlign: 'center',
            paddingTop: 16,
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
                onPress={() =>
                  RootNavigation.navigate('Park', { park: park.id })
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
                    uri: park.image_url,
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
