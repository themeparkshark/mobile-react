import { createContext, FC, ReactNode, useState } from 'react';
import DailyGiftModal from '../components/DailyGiftModal';
import { DailyGiftType } from '../models/daily-gift-type';

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
