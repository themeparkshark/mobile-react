import { faCircleCheck } from '@fortawesome/pro-light-svg-icons/faCircleCheck';
import { FontAwesomeIcon } from '@fortawesome/react-native-fontawesome';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { TouchableOpacity, View } from 'react-native';
import view from '../api/endpoints/social-posts/view';
import { SocialPostType } from '../models/social-post-type';

export default function SocialPost({
  socialPost,
}: {
  readonly socialPost: SocialPostType;
}) {
  const [hasWatched, setHasWatched] = useState<boolean>(socialPost.has_watched);

  return (
    <View
      style={{
        padding: 8,
      }}
    >
      <TouchableOpacity
        onPress={async () => {
          await WebBrowser.openBrowserAsync(socialPost.permalink);
          await view(socialPost);
          setHasWatched(true);
        }}
        style={{
          width: '100%',
          aspectRatio: 16 / 9,
        }}
      >
        {hasWatched && (
          <View
            style={{
              backgroundColor: 'rgba(0, 0, 0, .6)',
              position: 'absolute',
              width: '100%',
              height: '100%',
              zIndex: 10,
              borderRadius: 10,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <FontAwesomeIcon icon={faCircleCheck} size={56} color={'white'} />
          </View>
        )}
        <Image
          source={socialPost.image_url}
          style={{
            width: '100%',
            height: '100%',
            borderRadius: 10,
          }}
        />
      </TouchableOpacity>
    </View>
  );
}
