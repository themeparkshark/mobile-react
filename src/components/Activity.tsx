import { Text, View } from 'react-native';
import dayjs from '../helpers/dayjs';
import { ActivityType } from '../models/activity-type';

export default function Activity({
  activities,
}: {
  readonly activities: ActivityType[];
}) {
  return (
    <View>
      {!activities.length && (
        <Text
          style={{
            fontFamily: 'Knockout',
            fontSize: 18,
            textAlign: 'center',
          }}
        >
          There is no recent activity.
        </Text>
      )}
      {activities.map((activity, index) => {
        return (
          <View
            key={activity.id}
            style={{
              flexDirection: 'row',
              paddingBottom: index !== activities.length ? 8 : 0,
            }}
          >
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 18,
                }}
              >
                {activity.body}
              </Text>
            </View>
            <View
              style={{
                width: '20%',
              }}
            >
              <Text
                style={{
                  fontFamily: 'Knockout',
                  fontSize: 18,
                  textAlign: 'right',
                }}
              >
                {dayjs(activity.created_at).fromNow()} ago
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}
