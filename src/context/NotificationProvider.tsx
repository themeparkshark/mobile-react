import { createContext, FC, ReactNode, useCallback, useContext, useState } from 'react';
import { useIntervalWhen } from 'rooks';
import unreadNotificationsCount from '../api/endpoints/me/unread-notifications-count';
import { AuthContext } from './AuthProvider';

export interface NotificationContextType {
  readonly notificationCount: number;
  readonly refreshNotificationCount: () => Promise<void>;
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

  const refreshNotificationCount = useCallback(async () => {
    try {
      const response = await unreadNotificationsCount();
      setNotificationCount(response?.unread_notifications_count ?? 0);
    } catch {
      // Keep the last confirmed badge count while the profile service is unavailable.
    }
  }, []);

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
