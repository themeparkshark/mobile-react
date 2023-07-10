import { faComments } from '@fortawesome/pro-light-svg-icons/faComments';
import { faFaceSmile } from '@fortawesome/pro-light-svg-icons/faFaceSmile';
import { faFlag } from '@fortawesome/pro-light-svg-icons/faFlag';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { FlashList } from '@shopify/flash-list';
import { useContext, useState } from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getComments from '../api/endpoints/comments/getComments';
import getThread from '../api/endpoints/threads/getThread';
import Avatar from '../components/Avatar';
import Comment from '../components/Comment';
import CreateReply from '../components/CreateReply';
import Loading from '../components/Loading';
import Tag from '../components/Tag';
import Topbar from '../components/Topbar';
import { ForumContext } from '../context/ForumProvider';
import dayjs from '../helpers/dayjs';
import { CommentType } from '../models/comment-type';
import { ThreadType } from '../models/thread-type';

export default function ThreadScreen({ route }) {
  const { thread } = route.params;
  const { setActiveComment } = useContext(ForumContext);
  const [loading, setLoading] = useState<boolean>(true);
  const [currentThread, setCurrentThread] = useState<ThreadType>();
  const [page, setPage] = useState<number>(1);
  const [comments, setComments] = useState<CommentType[]>([]);
  const [comment, setComment] = useState<CommentType>();

  const fetchComments = async (page: number) => {
    if (!currentThread) {
      return;
    }

    const response = await getComments(currentThread.id, page);
    setComments((prevState) => {
      return [...prevState, ...response];
    });
  };

  useAsyncEffect(async () => {
    setCurrentThread(await getThread(thread));
  }, []);

  useAsyncEffect(async () => {
    if (!currentThread) {
      return;
    }

    await fetchComments(page);
    setLoading(false);
  }, [currentThread]);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchComments(page);
    }
  }, [page]);

  return (
    <>
      <Topbar
        showBackButton
        onBackButtonPress={() => setActiveComment(undefined)}
      />
      {loading && <Loading />}
      {!loading && currentThread && (
        <View
          style={{
            marginTop: -8,
            flex: 1,
          }}
        >
          <FlashList
            data={comments}
            ListHeaderComponent={
              <View style={{ padding: 16, backgroundColor: 'white' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View>
                    <Avatar size={50} user={currentThread.user} />
                  </View>
                  <View style={{ paddingLeft: 16 }}>
                    <Text>
                      {currentThread.user.screen_name} -{' '}
                      {dayjs(currentThread.created_at)
                        .startOf('second')
                        .fromNow()}
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
                {currentThread.content && (
                  <Text
                    style={{
                      paddingTop: 16,
                      paddingBottom: 16,
                      fontSize: 16,
                      lineHeight: 24,
                    }}
                  >
                    {currentThread.content}
                  </Text>
                )}
                <View
                  style={{
                    marginTop: 16,
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                  }}
                >
                  <View>
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                      }}
                    >
                      <FontAwesomeIcon
                        icon={faFaceSmile}
                        size={16}
                        color="black"
                      />
                      <Text
                        style={{
                          paddingLeft: 16,
                        }}
                      >
                        {currentThread.reactions_count}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  <View>
                    <View
                      style={{
                        flexDirection: 'row',
                      }}
                    >
                      <FontAwesomeIcon
                        icon={faComments}
                        size={16}
                        color="black"
                      />
                      <Text
                        style={{
                          paddingLeft: 16,
                        }}
                      >
                        {currentThread.comments_count}
                      </Text>
                    </View>
                  </View>
                  <View>
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
              </View>
            }
            renderItem={({ item }) => {
              return (
                <View
                  style={{
                    backgroundColor: 'white',
                    marginTop: 8,
                  }}
                >
                  <Comment
                    comment={item}
                    onReplyPress={(comment) => {
                      setComment(comment);
                    }}
                  />
                </View>
              );
            }}
            estimatedItemSize={100}
            keyExtractor={(item) => item.id.toString()}
            onEndReached={() => {
              setPage((prevState) => prevState + 1);
            }}
          />
          <CreateReply
            thread={currentThread}
            onSubmit={async () => {
              setComments(await getComments(currentThread.id, 1));
              setCurrentThread(await getThread(thread));
              setPage(1);
            }}
          />
        </View>
      )}
    </>
  );
}
