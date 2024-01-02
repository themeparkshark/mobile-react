import * as WebBrowser from 'expo-web-browser';
import { Text, TouchableOpacity, View } from 'react-native';
import { LiveEventType } from '../models/live-event-type';

export default function LiveEvents({
  liveEvents,
}: {
  readonly liveEvents: LiveEventType[];
}) {
  return liveEvents.map((liveEvent) => {
    return (
      <TouchableOpacity
        key={liveEvent.id}
        style={{
          marginBottom: 16,
          flexDirection: 'row',
          alignItems: 'center',
        }}
        onPress={() => {
          WebBrowser.openBrowserAsync(liveEvent.permalink);
        }}
      >
        <View
          style={{
            backgroundColor: 'red',
            padding: 4,
            borderRadius: 4,
            marginRight: 8,
          }}
        >
          <Text
            style={{
              textTransform: 'uppercase',
              color: 'white',
              fontFamily: 'Knockout',
            }}
          >
            Live
          </Text>
        </View>
        <View
          style={{
            flex: 1,
          }}
        >
          <Text
            style={{
              textTransform: 'uppercase',
              fontFamily: 'Knockout',
            }}
          >
            {liveEvent.title}
          </Text>
        </View>
      </TouchableOpacity>
    );
  });
}
