import { useState } from 'react';
import { Text, TextInput, TouchableOpacity, View } from 'react-native';
import createComment from '../api/endpoints/comments/create';
import { ThreadType } from '../models/thread-type';

export default function CreateReply({
  thread,
  onSubmit,
}: {
  readonly thread: ThreadType;
  readonly onSubmit: () => void;
}) {
  const [content, setContent] = useState<string>('');

  return (
    <View
      style={{
        paddingTop: 16,
      }}
    >
      <TextInput
        style={{
          fontSize: 16,
          width: '100%',
          borderWidth: 1,
          borderRadius: 4,
          borderColor: 'rgba(0, 0, 0, .5)',
          padding: 8,
        }}
        onChangeText={setContent}
        value={content}
        placeholder="Add a comment"
        multiline
      />
      <View
        style={{
          marginTop: 8,
        }}
      >
        <TouchableOpacity
          disabled={!content.length}
          onPress={async () => {
            await createComment(thread.id, content);
            onSubmit();
            setContent('');
          }}
        >
          <Text>Reply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
