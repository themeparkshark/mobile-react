import {createContext, Dispatch, FC, ReactNode, SetStateAction, useState} from 'react';
import {CommentType} from '../models/comment-type';

export interface ForumContextType {
  readonly activeComment?: CommentType;
  readonly setActiveComment: Dispatch<SetStateAction<CommentType | undefined>>;
}

export const ForumContext = createContext<ForumContextType>(
  {} as ForumContextType
);

export const ForumProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [activeComment, setActiveComment] = useState<CommentType|undefined>();

  return (
    <ForumContext.Provider
      value={{
        activeComment,
        setActiveComment,
      }}
    >
      {children}
    </ForumContext.Provider>
  );
};
