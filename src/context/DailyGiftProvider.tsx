import { createContext, FC, ReactNode, useContext, useEffect, useState } from 'react';
import { useTimeoutWhen } from 'rooks';
import getDailyGift from '../api/endpoints/daily-gifts/create';
import { ws7Preview } from '../dev/ws7Preview';
import { DailyGiftType } from '../models/daily-gift-type';
import * as RootNavigation from '../RootNavigation';
import { activateVipForPlayer } from '../services/purchases';
import { AuthContext } from './AuthProvider';

export interface DailyGiftContextType {
  readonly dailyGift: DailyGiftType | null;
  readonly setDailyGift: (dailyGift: DailyGiftType) => void;
}

export const DailyGiftContext = createContext<DailyGiftContextType>(
  {} as DailyGiftContextType
);

export const DailyGiftProvider: FC<{ children: ReactNode }> = ({
  children,
}) => {
  const [dailyGift, setDailyGift] = useState<DailyGiftType | null>(null);
  const { player, isReady } = useContext(AuthContext);
  const preview = ws7Preview();

  useTimeoutWhen(
    async () => {
      // The request carries the device timezone, so the chest is per local day.
      setDailyGift(await getDailyGift());
    },
    5000,
    Boolean(isReady && player && player.username)
  );

  // Link the signed-in player to Adapty right away, so renewals, restores and
  // webhooks carry their id even if they never open the VIP page this run.
  // This provider mounts at the root for every signed-in player.
  useEffect(() => {
    if (isReady && player?.id) activateVipForPlayer(player.id);
  }, [isReady, player?.id]);

  // Dev-only visual QA: jump straight to a WS7 screen once signed in.
  useEffect(() => {
    if (!isReady || !player) return;
    const timer = setTimeout(() => {
      if (preview === 'store' || preview === 'store-poor') RootNavigation.navigate('Store', { store: 'shark-shop' });
      if (preview === 'vip') RootNavigation.navigate('Membership');
    }, 2500);
    return () => clearTimeout(timer);
  }, [isReady, player?.id, preview]);

  return (
    <DailyGiftContext.Provider
      value={{
        dailyGift,
        setDailyGift,
      }}
    >
      {children}
    </DailyGiftContext.Provider>
  );
};
