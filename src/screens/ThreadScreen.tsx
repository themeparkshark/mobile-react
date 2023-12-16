import { faEllipsis } from '@fortawesome/pro-light-svg-icons/faEllipsis';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { FlashList } from '@shopify/flash-list';
import { Image } from 'expo-image';
import { useContext, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import * as RootNavigation from '../RootNavigation';
import getComments from '../api/endpoints/comments/getComments';
import getThread from '../api/endpoints/threads/getThread';
import AttachmentModal from '../components/AttachmentModal';
import Avatar from '../components/Avatar';
import Button from '../components/Button';
import Comment from '../components/Comment';
import CreateReply from '../components/CreateReply';
import CreateReport from '../components/CreateReport';
import Loading from '../components/Loading';
import Reactions from '../components/Reactions';
import ReactionsDropdown from '../components/ReactionsDropdown';
import { SortOption } from '../components/SortByDropdown';
import Tag from '../components/Tag';
import ThreadActions from '../components/ThreadActions';
import Topbar, { BackButton } from '../components/Topbar';
import TopbarColumn from '../components/Topbar/TopbarColumn';
import { AuthContext } from '../context/AuthProvider';
import { ForumContext } from '../context/ForumProvider';
import dayjs from '../helpers/dayjs';
import useCrumbs from '../hooks/useCrumbs';
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
  const { reactionTypes } = useContext(ForumContext);
  const { player } = useContext(AuthContext);
  const { warnings, labels } = useCrumbs();
  const options = [
    {
      label: labels.new,
      value: 'latest',
    },
    {
      label: labels.most_reactions,
      value: 'most_reactions',
    },
  ];
  const [filter, setFilter] = useState<SortOption>(options[0]);

  const fetchComments = async (page: number) => {
    if (!currentThread) {
      return;
    }

    const response = await getComments(currentThread.id, page, {
      sort: filter.value,
    });
    setComments((prevState) => {
      return [...prevState, ...response];
    });
  };

  const requestThread = async () => {
    try {
      const response = await getThread(thread);
      setCurrentThread(response);
    } catch (error) {
      Alert.alert(warnings.something_went_wrong, labels.please_try_again, [
        {
          text: 'Go back',
          onPress: () => {
            RootNavigation.goBack();
          },
        },
      ]);
    }
  };

  useAsyncEffect(requestThread, []);

  useAsyncEffect(async () => {
    if (!currentThread) {
      return;
    }

    await fetchComments(page);
    setLoading(false);
  }, [currentThread]);

  useAsyncEffect(async () => {
    if (loading) {
      return;
    }

    await fetchComments(1);
    setPage(1);
  }, [filter]);

  useAsyncEffect(async () => {
    if (page > 1) {
      await fetchComments(page);
    }
  }, [page]);

  return (
    <>
      <Topbar>
        <TopbarColumn stretch={false}>
          <BackButton onPress={() => setActiveComment(undefined)} />
        </TopbarColumn>
        <TopbarColumn />
        <TopbarColumn stretch={false}>
          {currentThread && (
            <ThreadActions
              trigger={
                <FontAwesomeIcon icon={faEllipsis} size={24} color={'white'} />
              }
              thread={currentThread}
            />
          )}
        </TopbarColumn>
      </Topbar>
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
              <>
                <View style={{ padding: 16, backgroundColor: 'white' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View>
                      <Button
                        onPress={() => {
                          RootNavigation.navigate('Player', {
                            player: currentThread.player.id,
                          });
                        }}
                      >
                        <Avatar size="sm" player={currentThread.player} />
                      </Button>
                    </View>
                    <View style={{ paddingLeft: 16 }}>
                      <Text>
                        {currentThread.player.screen_name} -{' '}
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
                      margin: -8,
                      flexWrap: 'wrap',
                      flexDirection: 'row',
                    }}
                  >
                    {currentThread.attachments.map((attachment) => {
                      return (
                        <View
                          key={attachment.id}
                          style={{
                            width:
                              currentThread.attachments.length > 1
                                ? '33.3333333%'
                                : '100%',
                            padding: 8,
                          }}
                        >
                          <AttachmentModal attachment={attachment} />
                        </View>
                      );
                    })}
                  </View>
                  <View
                    style={{
                      marginTop: 16,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      columnGap: 48,
                    }}
                  >
                    <View>
                      <ReactionsDropdown
                        model={{ id: currentThread.id, type: 'thread' }}
                        activeReaction={currentThread.current_user_reaction}
                        onReactionChange={() => requestThread()}
                      >
                        {currentThread.current_user_reaction ? (
                          <>
                            <Image
                              source={{
                                uri: currentThread.current_user_reaction
                                  .reaction_type.image_url,
                              }}
                              style={{
                                width: 20,
                                height: 20,
                              }}
                            />
                            <Text
                              style={{
                                paddingLeft: 8,
                              }}
                            >
                              {
                                currentThread.current_user_reaction
                                  .reaction_type.name
                              }
                            </Text>
                          </>
                        ) : (
                          <>
                            <Image
                              source={{
                                uri: reactionTypes[0].image_url,
                              }}
                              style={{
                                width: 20,
                                height: 20,
                              }}
                            />
                            <Text
                              style={{
                                paddingLeft: 8,
                              }}
                            >
                              React
                            </Text>
                          </>
                        )}
                      </ReactionsDropdown>
                    </View>
                    {player && (
                      <View>
                        <CreateReport
                          model={{ id: currentThread.id, type: 'thread' }}
                          showText
                        />
                      </View>
                    )}
                  </View>
                  {currentThread.reactions_count > 0 && (
                    <View style={{ marginTop: 16, zIndex: -1 }}>
                      <Reactions
                        count={currentThread.reactions_count}
                        reactions={currentThread.reactions}
                        hasReacted={currentThread.current_user_reaction}
                      />
                    </View>
                  )}
                </View>
                <View
                  style={{
                    paddingLeft: 16,
                    paddingTop: 16,
                  }}
                >
                  {/*<SortByDropdown*/}
                  {/*  activeOption={filter}*/}
                  {/*  options={options}*/}
                  {/*  onChange={async (activeOption) => {*/}
                  {/*    setComments([]);*/}
                  {/*    setFilter(activeOption);*/}
                  {/*  }}*/}
                  {/*  title={labels.sort_comments}*/}
                  {/*  resource={labels.comments}*/}
                  {/*/>*/}
                </View>
              </>
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
            ListFooterComponentStyle={{
              height: player ? 120 : 40,
            }}
          />
          {player && (
            <CreateReply
              thread={currentThread}
              onSubmit={async () => {
                setComments(await getComments(currentThread.id, 1));
                setCurrentThread(await getThread(thread));
                setPage(1);
              }}
            />
          )}
        </View>
      )}
    </>
  );
}
