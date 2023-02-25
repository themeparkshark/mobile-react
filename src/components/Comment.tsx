import { faReply } from '@fortawesome/pro-light-svg-icons/faReply';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import {useContext, useState} from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAsyncEffect } from 'rooks';
import getChildren from '../api/endpoints/comments/getChildren';
import dayjs from '../helpers/dayjs';
import { CommentType } from '../models/comment-type';
import Avatar from './Avatar';
import {ForumContext} from '../context/ForumProvider';

export default function Comment({
  comment,
  onReplyPress,
}: {
  readonly comment: CommentType;
  readonly onReplyPress: (comment: CommentType) => void;
}) {
  const childrenLimit = 8;
  const { activeComment, setActiveComment } = useContext(ForumContext);
  const [page, setPage] = useState<number>(1);
  const [children, setChildren] = useState<CommentType[]>(comment.children);
  const [canLoadMore, setCanLoadMore] = useState<boolean>(
    comment.children_count > childrenLimit
  );

  useAsyncEffect(async () => {
    if (page <= 1) {
      return;
    }

    const response = await getChildren(comment.id, page);
    setChildren((prevState) => [...prevState, ...response.data]);
    setCanLoadMore(response.meta.current_page !== response.meta.total);
  }, [page]);

  return (
    <>
      <View
        style={{
          backgroundColor: activeComment?.id === comment.id ? 'rgba(0, 0, 0, .05)' : 'transparent',
          paddingTop: 16,
          paddingRight: 16,
          paddingLeft: 16,
          paddingBottom: 16,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View>
            <Avatar size={40} user={comment.user} />
          </View>
          <View style={{ paddingLeft: 16 }}>
            <Text>
              {comment.user.screen_name} -{' '}
              {dayjs(comment.updated_at).startOf('second').fromNow()}
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
            {comment.content}
          </Text>
          <View>
            <View>
              <TouchableOpacity
                style={{
                  flexDirection: 'row',
                  justifyContent: 'flex-end',
                }}
                onPress={() => {
                  setActiveComment(comment);
                  onReplyPress(comment);
                }}
              >
                <FontAwesomeIcon icon={faReply} size={16} color="black" />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
      {comment.children.length > 0 && (
        <View
          style={{
            marginLeft: 16,
            borderLeftWidth: 1,
            borderStyle: 'solid',
            borderLeftColor: 'rgba(0, 0, 0, .25)',
          }}
        >
          {children.map((child) => {
            return (
              <Comment key={child.id} comment={child} onReplyPress={() => {}} />
            );
          })}
          {canLoadMore && (
            <TouchableOpacity
              style={{
                backgroundColor: 'rgba(0, 0, 0, .10)',
                marginLeft: 16,
                marginRight: 16,
                marginTop: 16,
                padding: 8,
              }}
              onPress={() => {
                setPage((prevState) => prevState + 1);
              }}
            >
              <Text
                style={{
                  textAlign: 'center',
                }}
              >
                Load more replies
              </Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </>
  );
}
