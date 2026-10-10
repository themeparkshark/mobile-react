import {
  createContext,
  Dispatch,
  FC,
  ReactNode,
  SetStateAction,
  useEffect,
  useState,
} from 'react';
import { Image } from 'expo-image';
import { useAsyncEffect } from 'rooks';
import all from '../api/endpoints/reaction-types/all';
import { CommentType } from '../models/comment-type';
import { ReactionTypeType } from '../models/reaction-type-type';

export interface ForumContextType {
  readonly activeComment?: CommentType;
  readonly setActiveComment: Dispatch<SetStateAction<CommentType | undefined>>;
  readonly recentlyAddedComment?: CommentType;
  readonly setRecentlyAddedComment: Dispatch<
    SetStateAction<CommentType | undefined>
  >;
  readonly reactionTypes: ReactionTypeType[];
}

export const ForumContext = createContext<ForumContextType>(
  {} as ForumContextType
);

export const ForumProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [activeComment, setActiveComment] = useState<CommentType | undefined>();
  const [recentlyAddedComment, setRecentlyAddedComment] = useState<
    CommentType | undefined
  >();
  const [reactionTypes, setReactionTypes] = useState<ReactionTypeType[]>([]);

  useEffect(() => {
    if (!recentlyAddedComment) {
      return;
    }

    const timeout = setTimeout(() => {
      setRecentlyAddedComment(undefined);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [recentlyAddedComment]);

  // Mounted at the app root, so this runs on every launch, often offline in a
  // park. A failure keeps the empty list; it must never be an unhandled rejection.
  useAsyncEffect(async () => {
    try {
      const types = await all();
      if (Array.isArray(types)) setReactionTypes(types);
    } catch {
      // Reactions simply stay hidden until the next launch.
    }
  }, []);

  // Warm the shark faces so a post never opens on blank reaction buttons.
  useEffect(() => {
    const urls = reactionTypes.map((type) => type?.image_url).filter(Boolean);
    if (urls.length) Image.prefetch(urls).catch(() => undefined);
  }, [reactionTypes]);

  return (
    <ForumContext.Provider
      value={{
        activeComment,
        setActiveComment,
        recentlyAddedComment,
        setRecentlyAddedComment,
        reactionTypes,
      }}
    >
      {children}
    </ForumContext.Provider>
  );
};
