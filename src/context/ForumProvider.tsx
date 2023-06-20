import {
  createContext,
  Dispatch,
  FC,
  ReactNode,
  SetStateAction,
  useEffect,
  useState,
} from 'react';
import { CommentType } from '../models/comment-type';

export interface ForumContextType {
  readonly activeComment?: CommentType;
  readonly setActiveComment: Dispatch<SetStateAction<CommentType | undefined>>;
  readonly recentlyAddedComment?: CommentType;
  readonly setRecentlyAddedComment: Dispatch<
    SetStateAction<CommentType | undefined>
  >;
}

export const ForumContext = createContext<ForumContextType>(
  {} as ForumContextType
);

export const ForumProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [activeComment, setActiveComment] = useState<CommentType | undefined>();
  const [recentlyAddedComment, setRecentlyAddedComment] = useState<
    CommentType | undefined
  >();

  useEffect(() => {
    if (!recentlyAddedComment) {
      return;
    }

    const timeout = setTimeout(() => {
      setRecentlyAddedComment(undefined);
    }, 5000);

    return () => clearTimeout(timeout);
  }, [recentlyAddedComment]);

  return (
    <ForumContext.Provider
      value={{
        activeComment,
        setActiveComment,
        recentlyAddedComment,
        setRecentlyAddedComment,
      }}
    >
      {children}
    </ForumContext.Provider>
  );
};
