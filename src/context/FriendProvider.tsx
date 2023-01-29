import {
  createContext,
  FC,
  ReactNode,
  useState,
} from 'react';
import {UserType} from '../models/user-type';
import getFriends from '../api/endpoints/me/friends';

export interface FriendContextType {
  readonly friends: UserType[];
  readonly refreshFriends: () => void;
}

export const FriendContext = createContext<FriendContextType>(
  {} as FriendContextType
);

export const FriendProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [friends, setFriends] = useState<UserType[]>([]);

  const refreshFriends = async () => {
    setFriends(await getFriends({
      limit: 5,
    }));
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
