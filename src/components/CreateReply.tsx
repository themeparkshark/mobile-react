import { useState } from 'react';
import {
  Dimensions,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import createComment from '../api/endpoints/comments/create';
import config from '../config';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { CommentType } from '../models/comment-type';
import { ThreadType } from '../models/thread-type';

export default function CreateReply({
  comment,
  thread,
  onSubmit,
}: {
  readonly comment?: CommentType;
  readonly thread: ThreadType;
  readonly onSubmit: () => void;
}) {
  const [content, setContent] = useState<string>('');
  const keyboardHeight = useKeyboardHeight();

  return (
    <SafeAreaView
      style={{
        bottom: keyboardHeight,
        backgroundColor: 'white',
        width: Dimensions.get('window').width,
      }}
    >
      <View
        style={{
          padding: 16,
        }}
      >
        <TextInput
          style={{
            fontSize: 16,
            width: '100%',
            borderRadius: 4,
            backgroundColor: 'rgba(0, 0, 0, .05)',
            color: 'black',
            paddingLeft: 16,
            paddingRight: 16,
            paddingTop: 12,
            paddingBottom: 12,
          }}
          placeholderTextColor="rgba(0, 0, 0, .5)"
          onChangeText={setContent}
          value={content}
          placeholder="Add a comment"
          multiline
        />
        <View
          style={{
            alignItems: 'flex-end',
          }}
        >
          <View>
            <TouchableOpacity
              style={{
                marginTop: 8,
                backgroundColor: config.secondary,
                borderRadius: 10,
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 16,
                paddingRight: 16,
              }}
              onPress={async () => {
                await createComment(thread.id, content);
                setContent('');
                await onSubmit();
              }}
            >
              <View>
                <Text style={{ textAlign: 'center', color: 'white' }}>
                  Reply
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}
