import { faArrowRight } from '@fortawesome/pro-light-svg-icons/faArrowRight';
import { faMicrophone } from '@fortawesome/pro-light-svg-icons/faMicrophone';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
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
          columnGap: 8,
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
            flexDirection: 'row',
            columnGap: 4,
            alignItems: 'center',
          }}
        >
          <FontAwesomeIcon
            icon={faMicrophone}
            size={14}
            style={{ color: 'white' }}
          />
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
        <View>
          <FontAwesomeIcon icon={faArrowRight} size={16} />
        </View>
      </TouchableOpacity>
    );
  });
}
