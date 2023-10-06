import { Image } from 'expo-image';
import { truncate } from 'lodash';
import { Text, TouchableOpacity, View } from 'react-native';
import config from '../config';
import dayjs from '../helpers/dayjs';
import shortenNumber from '../helpers/shorten-number';
import { ThreadType } from '../models/thread-type';
import * as RootNavigation from '../RootNavigation';
import Avatar from './Avatar';

export default function Thread({ thread }: { readonly thread: ThreadType }) {
  return (
    <View
      style={{
        paddingLeft: 10,
        paddingRight: 16,
        paddingTop: 12,
        paddingBottom: 12,
        backgroundColor: 'white',
      }}
    >
      <TouchableOpacity
        key={thread.id}
        onPress={() => {
          RootNavigation.navigate('Thread', {
            thread: thread.id,
          });
        }}
        style={{
          flexDirection: 'row',
          borderLeftWidth: 2,
          borderLeftColor: thread.pinned_at ? config.primary : 'transparent',
          paddingLeft: 16,
          alignItems: 'center',
        }}
      >
        <View>
          {thread.attachments.length ? (
            <Image
              source={thread.attachments[0].path}
              style={{ aspectRatio: 4 / 3, borderRadius: 8, width: 60 }}
              contentFit="cover"
            />
          ) : (
            <Avatar user={thread.user} />
          )}
        </View>
        <View
          style={{
            paddingLeft: 16,
            flex: 1,
          }}
        >
          <Text
            style={{
              fontSize: 12,
            }}
          >
            {thread.user.screen_name} -{' '}
            {dayjs(thread.created_at).startOf('second').fromNow()}
          </Text>
          <Text
            style={{
              paddingTop: 8,
              fontFamily: 'Knockout',
              fontSize: 22,
            }}
          >
            {thread.title}
          </Text>
          {thread.latest_comment && !thread.pinned_at && (
            <>
              <Text
                style={{
                  paddingTop: 8,
                  paddingBottom: 8,
                  fontSize: 12,
                }}
              >
                {thread.latest_comment.user.screen_name} replied{' '}
                {dayjs(thread.latest_comment.created_at)
                  .startOf('second')
                  .fromNow()}
              </Text>
              <Text
                style={{
                  opacity: 0.5,
                  fontSize: 12,
                }}
              >
                {truncate(thread.latest_comment.content, {
                  length: 100,
                })}
              </Text>
            </>
          )}
        </View>
        <View
          style={{
            paddingLeft: 16,
          }}
        >
          <View
            style={{
              backgroundColor: 'rgba(0, 0, 0, .05)',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 16,
              padding: 8,
            }}
          >
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 18,
              }}
            >
              {shortenNumber(thread.comments_count)}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    </View>
  );
}
