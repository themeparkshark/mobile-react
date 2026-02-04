import { createContext, FC, ReactNode, useContext, useState } from 'react';
import { useIntervalWhen } from 'rooks';
import unreadNotificationsCount from '../api/endpoints/me/unread-notifications-count';
import { AuthContext } from './AuthProvider';

export interface NotificationContextType {
  readonly notificationCount: number;
  readonly refreshNotificationCount: () => void;
}

export const NotificationContext = createContext<NotificationContextType>(
  {} as NotificationContextType
);

export const NotificationProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [notificationCount, setNotificationCount] = useState<number>(0);
  const { isReady, player } = useContext(AuthContext);

  useIntervalWhen(
    async () => {
      await refreshNotificationCount();
    },
    120000,
    Boolean(isReady && player),
    true
  );

  const refreshNotificationCount = async () => {
    const response = await unreadNotificationsCount();
    setNotificationCount(response?.unread_notifications_count ?? 0);
  };

  return (
    <NotificationContext.Provider
      value={{
        notificationCount,
        refreshNotificationCount,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
};
