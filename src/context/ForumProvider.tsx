import {
  createContext,
  Dispatch,
  FC,
  ReactNode,
  SetStateAction,
  useEffect,
  useState,
} from 'react';
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
      setReactionTypes(await all());
    } catch {
      // Reactions simply stay hidden until the next launch.
    }
  }, []);

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
