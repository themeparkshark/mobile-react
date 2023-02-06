import { faComments } from '@fortawesome/pro-light-svg-icons/faComments';
import { faFaceSmile } from '@fortawesome/pro-light-svg-icons/faFaceSmile';
import { faFlag } from '@fortawesome/pro-light-svg-icons/faFlag';
import { faShare } from '@fortawesome/pro-light-svg-icons/faShare';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { useCallback, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useAsyncEffect } from 'rooks';
import getThread from '../api/endpoints/threads/getThread';
import Avatar from '../components/Avatar';
import Comments from '../components/Comments';
import Loading from '../components/Loading';
import Tag from '../components/Tag';
import Topbar from '../components/Topbar';
import Wrapper from '../components/Wrapper';
import dayjs from '../helpers/dayjs';
import { ThreadType } from '../models/thread-type';

export default function StoreScreen({ route }) {
  const { thread } = route.params;
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [currentThread, setCurrentThread] = useState<ThreadType>();

  useAsyncEffect(async () => {
    setCurrentThread(await getThread(thread));
    setLoading(false);
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    (async () => {
      setCurrentThread(await getThread(thread));
    })();
    setRefreshing(false);
  }, []);

  return (
    <Wrapper>
      <Topbar showBackButton />
      {loading && <Loading />}
      {!loading && currentThread && (
        <ScrollView
          contentContainerStyle={{
            flex: 1,
          }}
          style={{
            marginTop: -8,
          }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          <View
            style={{
              padding: 16,
              flex: 1,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View>
                <Avatar size={50} user={currentThread.user} />
              </View>
              <View style={{ paddingLeft: 16 }}>
                <Text>
                  {currentThread.user.screen_name} -{' '}
                  {dayjs(currentThread.created_at).startOf('second').fromNow()}
                </Text>
              </View>
            </View>
            <Text
              style={{
                fontFamily: 'Knockout',
                fontSize: 28,
                paddingTop: 16,
                paddingBottom: 16,
              }}
            >
              {currentThread.title}
            </Text>
            <View
              style={{
                flexDirection: 'row',
                flexWrap: 'wrap',
              }}
            >
              {currentThread.tags.map((tag) => (
                <Tag key={tag.id} tag={tag} />
              ))}
            </View>
            <Text
              style={{
                paddingTop: 16,
                fontSize: 16,
              }}
            >
              {currentThread.content}
            </Text>
            <View
              style={{
                marginTop: 16,
                marginBottom: 16,
                flexDirection: 'row',
              }}
            >
              <View
                style={{
                  flex: 1,
                }}
              >
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                  }}
                >
                  <FontAwesomeIcon icon={faFaceSmile} size={16} color="black" />
                  <Text
                    style={{
                      paddingLeft: 16,
                    }}
                  >
                    {currentThread.reactions_count}
                  </Text>
                </TouchableOpacity>
              </View>
              <View
                style={{
                  flex: 1,
                }}
              >
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                  }}
                >
                  <FontAwesomeIcon icon={faComments} size={16} color="black" />
                  <Text
                    style={{
                      paddingLeft: 16,
                    }}
                  >
                    {currentThread.comments_count}
                  </Text>
                </TouchableOpacity>
              </View>
              <View
                style={{
                  flex: 1,
                }}
              >
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                  }}
                >
                  <FontAwesomeIcon icon={faShare} size={16} color="black" />
                  <Text
                    style={{
                      paddingLeft: 16,
                    }}
                  >
                    Share
                  </Text>
                </TouchableOpacity>
              </View>
              <View
                style={{
                  flex: 1,
                }}
              >
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                  }}
                >
                  <FontAwesomeIcon icon={faFlag} size={16} color="black" />
                  <Text
                    style={{
                      paddingLeft: 16,
                    }}
                  >
                    Report
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            <View
              style={{
                paddingTop: 16,
                flex: 1,
              }}
            >
              <Comments thread={currentThread} />
            </View>
          </View>
        </ScrollView>
      )}
    </Wrapper>
  );
}
