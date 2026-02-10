import { Image } from 'expo-image';
import React, { useContext } from 'react';
import { Text, TextStyle, View } from 'react-native';
import { ForumContext } from '../context/ForumProvider';

interface RichTextProps {
  children: string;
  style?: TextStyle;
  numberOfLines?: number;
}

// Unicode emojis that map to our custom shark reactions
const EMOJI_TO_REACTION: Record<string, string> = {
  '😊': 'happy',
  '😂': 'laugh',
  '❤️': 'love',
  '😡': 'mad',
  '😢': 'sad',
  '😮': 'wow',
};

const EMOJI_PATTERN = /(😊|😂|❤️|😡|😢|😮)/g;

/**
 * Renders text with specific unicode emojis replaced by
 * the app's custom shark reaction images.
 */
export default function RichText({ children, style, numberOfLines }: RichTextProps) {
  const { reactionTypes } = useContext(ForumContext);

  if (!children || reactionTypes.length === 0) {
    return <Text style={style} numberOfLines={numberOfLines}>{children}</Text>;
  }

  // Build reaction name → image_url map
  const reactionImageMap: Record<string, string> = {};
  reactionTypes.forEach((rt) => {
    reactionImageMap[rt.name.toLowerCase()] = rt.image_url;
  });

  // Check if text contains any of our mapped emojis
  const parts = children.split(EMOJI_PATTERN);
  if (parts.length <= 1) {
    return <Text style={style} numberOfLines={numberOfLines}>{children}</Text>;
  }

  const fontSize = (style as any)?.fontSize || 15;
  const imageSize = fontSize * 1.4;

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, i) => {
        const reactionName = EMOJI_TO_REACTION[part];
        const imageUrl = reactionName ? reactionImageMap[reactionName] : null;
        if (imageUrl) {
          return (
            <View key={i} style={{ width: imageSize, height: imageSize, marginBottom: -3 }}>
              <Image source={{ uri: imageUrl }} style={{ width: imageSize, height: imageSize }} contentFit="contain" />
            </View>
          );
        }
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </Text>
  );
}
