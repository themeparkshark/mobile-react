import { FlashList } from '@shopify/flash-list';
import { useState } from 'react';
import {Text, TouchableOpacity, View} from 'react-native';
import { useAsyncEffect } from 'rooks';
import getComments from '../api/endpoints/comments/getComments';
import dayjs from '../helpers/dayjs';
import { CommentType } from '../models/comment-type';
import { ThreadType } from '../models/thread-type';
import Avatar from './Avatar';
import Loading from './Loading';
import {FontAwesomeIcon} from '@fortawesome/react-native-fontawesome';
import {faReply} from '@fortawesome/pro-light-svg-icons/faReply';

export default function Comments({ thread }: { readonly thread: ThreadType }) {
  const [comments, setComments] = useState<CommentType[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [page, setPage] = useState<number>(1);

  const fetchComments = async (page: number) => {
    const response = await getComments(thread.id, page);
    setComments((prevState) => {
      return [...prevState, ...response];
    });
  };

  useAsyncEffect(async () => {
    await fetchComments(page);
    setLoading(false);
  }, []);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchComments(page);
    }
  }, [page]);

  if (loading) {
    return <Loading />;
  }

  return (
    <View
      style={{
        flex: 1,
      }}
    >
      <FlashList
        data={comments}
        renderItem={({ item }) => (
          <View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View>
                <Avatar size={40} user={item.user} />
              </View>
              <View style={{ paddingLeft: 16 }}>
                <Text>
                  {item.user.screen_name} -{' '}
                  {dayjs(item.updated_at).startOf('second').fromNow()}
                </Text>
              </View>
            </View>
            <View
              style={{
                paddingTop: 16,
                paddingLeft: 3,
                paddingRight: 3,
              }}
            >
              <Text
                style={{
                  fontSize: 16,
                  paddingBottom: 16,
                }}
              >
                {item.content}
              </Text>
              <View>
                <View>
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'flex-end',
                    }}
                  >
                    <FontAwesomeIcon icon={faReply} size={16} color="black" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        )}
        estimatedItemSize={15}
        keyExtractor={(item) => item.id.toString()}
        onEndReached={() => {
          setPage((prevState) => prevState + 1);
        }}
      />
    </View>
  );
}
