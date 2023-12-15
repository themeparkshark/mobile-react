import { useContext, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Keyboard,
  KeyboardEvent,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import createComment from '../api/endpoints/comments/create';
import config from '../config';
import { ForumContext } from '../context/ForumProvider';
import useCrumbs from '../hooks/useCrumbs';
import { ThreadType } from '../models/thread-type';

export default function CreateReply({
  thread,
  onSubmit,
}: {
  readonly thread: ThreadType;
  readonly onSubmit: () => void;
}) {
  const { activeComment, setActiveComment, setRecentlyAddedComment } =
    useContext(ForumContext);
  const [content, setContent] = useState<string>('');
  const refInput = useRef(null);
  const [keyboardHeight, setKeyboardHeight] = useState(new Animated.Value(0));
  const { labels } = useCrumbs();
  const [hasPressed, setHasPressed] = useState<boolean>(false);

  useEffect(() => {
    if (!activeComment || !refInput) {
      return;
    }

    refInput.current.focus();
  }, [activeComment, refInput]);

  useEffect(() => {
    const keyboardWillShowListener = Keyboard.addListener(
      'keyboardWillShow',
      handleKeyboardWillShow
    );
    const keyboardWillHideListener = Keyboard.addListener(
      'keyboardWillHide',
      handleKeyboardWillHide
    );

    return () => {
      keyboardWillShowListener.remove();
      keyboardWillHideListener.remove();
    };
  }, []);

  const handleKeyboardWillShow = (event: KeyboardEvent): void => {
    const { duration, endCoordinates } = event;
    const screenHeight = Dimensions.get('window').height;
    const keyboardHeightValue = screenHeight - endCoordinates.screenY;
    Animated.timing(keyboardHeight, {
      duration: duration,
      toValue: keyboardHeightValue,
      useNativeDriver: false,
    }).start();
  };

  const handleKeyboardWillHide = (event: KeyboardEvent): void => {
    const { duration } = event;
    Animated.timing(keyboardHeight, {
      duration: duration,
      toValue: 0,
      useNativeDriver: false,
    }).start();
  };

  const translateY = keyboardHeight.interpolate({
    inputRange: [0, 1],
    outputRange: [0, -1],
  });

  return (
    <SafeAreaView>
      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            backgroundColor: 'white',
            width: Dimensions.get('window').width,
            shadowOffset: {
              width: 0,
              height: -4,
            },
            shadowOpacity: 0.2,
            shadowRadius: 5,
          },
          { transform: [{ translateY }] },
        ]}
      >
        <View
          style={{
            padding: 16,
          }}
        >
          <TextInput
            ref={refInput}
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
            placeholder={labels.add_a_comment}
            multiline
            onBlur={() => setActiveComment(undefined)}
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
                  if (!content || hasPressed) {
                    return;
                  }

                  setHasPressed(true);
                  const response = await createComment(
                    thread.id,
                    content,
                    activeComment?.id
                  );
                  setRecentlyAddedComment(response);
                  setContent('');
                  await onSubmit();
                }}
              >
                <View>
                  <Text style={{ textAlign: 'center', color: 'white' }}>
                    {labels.reply}
                  </Text>
                </View>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Animated.View>
    </SafeAreaView>
  );
}
