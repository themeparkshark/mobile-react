import { createContext, FC, ReactNode, useEffect, useState } from 'react';
import unreadNotificationsCount from '../api/endpoints/me/unread-notifications-count';

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

  useEffect(() => {
    const interval = setInterval(async () => {
      await refreshNotificationCount();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  const refreshNotificationCount = async () => {
    const response = await unreadNotificationsCount();
    setNotificationCount(response.unread_notifications_count);
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
