import { createContext, FC, ReactNode, useContext, useState } from 'react';
import { useTimeoutWhen } from 'rooks';
import getDailyGift from '../api/endpoints/daily-gifts/create';
import DailyGiftModal from '../components/DailyGiftModal';
import { DailyGiftType } from '../models/daily-gift-type';
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
  const { user, isReady } = useContext(AuthContext);

  useTimeoutWhen(
    async () => {
      setDailyGift(await getDailyGift());
    },
    5000,
    Boolean(isReady && user)
  );

  return (
    <DailyGiftContext.Provider
      value={{
        dailyGift,
        setDailyGift,
      }}
    >
      {dailyGift && dailyGift.redeemed_at === null && (
        <DailyGiftModal dailyGift={dailyGift} />
      )}
      {children}
    </DailyGiftContext.Provider>
  );
};
