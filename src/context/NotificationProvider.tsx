import { createContext, FC, ReactNode, useCallback, useContext, useMemo, useState } from 'react';
import useLivePoll from '../hooks/useLivePoll';
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

  const refreshNotificationCount = useCallback(async () => {
    try {
      const response = await unreadNotificationsCount();
      setNotificationCount(response?.unread_notifications_count ?? 0);
    } catch {
      // Keep the last confirmed badge count while the profile service is unavailable.
    }
  }, []);

  // Paused in the background; a return to the app refreshes the badge if it is due.
  useLivePoll(refreshNotificationCount, 120000, { enabled: Boolean(isReady && player), key: player?.id ?? null });

  const value = useMemo(() => ({ notificationCount, refreshNotificationCount }),
    [notificationCount, refreshNotificationCount]);

  return (
    <NotificationContext.Provider
      value={value}
    >
      {children}
    </NotificationContext.Provider>
  );
};
