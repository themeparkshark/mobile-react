import { faReply } from '@fortawesome/pro-light-svg-icons/faReply';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { Text, TouchableOpacity, View } from 'react-native';
import dayjs from '../helpers/dayjs';
import { CommentType } from '../models/comment-type';
import Avatar from './Avatar';
import {useState, useEffect} from 'react';

export default function Comment({
  comment,
  onReplyPress,
}: {
  readonly comment: CommentType;
  readonly onReplyPress: (comment: CommentType) => void;
}) {
  const [isSelected, setIsSelected] = useState<boolean>(false);

  useEffect(() => {
    if (comment.id === 13) {
      console.log(comment);
    }
  }, []);

  return (
    <>
      <View
        style={{
          backgroundColor: isSelected ? 'rgba(0, 0, 0, .05)' : 'transparent',
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
                  setIsSelected(true);
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
          {comment.children.map((child) => {
            return (
              <Comment key={child.id} comment={child} onReplyPress={() => {}} />
            );
          })}
        </View>
      )}
    </>
  );
}
