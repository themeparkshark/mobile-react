import { createContext, FC, ReactNode, useState } from 'react';
import getFriends from '../api/endpoints/me/friends';
import { UserType } from '../models/user-type';

export interface FriendContextType {
  readonly friends: UserType[];
  readonly refreshFriends: () => void;
}

export const FriendContext = createContext<FriendContextType>(
  {} as FriendContextType
);

export const FriendProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [friends, setFriends] = useState<UserType[]>([]);

  const refreshFriends = async () => {
    setFriends(await getFriends(1, 3));
  };

  return (
    <FriendContext.Provider
      value={{
        friends,
        refreshFriends,
      }}
    >
      {children}
    </FriendContext.Provider>
  );
};
