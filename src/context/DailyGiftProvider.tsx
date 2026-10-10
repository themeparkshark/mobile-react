import { createContext, FC, ReactNode, useContext, useEffect, useState } from 'react';
import { openMembership } from '../components/GrownUpGate';
import { useTimeoutWhen } from 'rooks';
import getDailyGift from '../api/endpoints/daily-gifts/create';
import { ws7Preview } from '../dev/ws7Preview';
import { DailyGiftType } from '../models/daily-gift-type';
import * as RootNavigation from '../RootNavigation';
import { syncVipOnLaunch } from '../services/purchases';
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
      // Runs 5 s after every signed-in launch, often offline or behind a
      // hotel Wi-Fi page: a failure just means no chest card this launch.
      try {
        setDailyGift(await getDailyGift());
      } catch {
        // The chest stays where it is; the next launch asks again.
      }
    },
    5000,
    Boolean(isReady && player && player.username)
  );

  // Once per launch, send the current App Store VIP entitlement to the server
  // so renewals and expiry land without webhooks. This provider mounts at the
  // root for every signed-in player. A no-op on binaries without StoreKit.
  useEffect(() => {
    if (isReady && player?.id) syncVipOnLaunch(player.id);
  }, [isReady, player?.id]);

  // Dev-only visual QA: jump straight to a WS7 screen once signed in.
  useEffect(() => {
    if (!isReady || !player) return;
    const timer = setTimeout(() => {
      if (preview === 'store' || preview === 'store-poor') RootNavigation.navigate('Store', { store: 'shark-shop' });
      // Dev QA only (ws7Preview is empty outside __DEV__): straight to the page, no gate.
      if (preview === 'vip') void openMembership({ devPreview: true });
    }, 2500);
    return () => clearTimeout(timer);
  }, [isReady, player?.id, preview]);

  // Dev-only: money screens by deep link for captures (src/dev/moneyPreview.ts).
  useEffect(() => {
    if (!__DEV__ || !isReady || !player) return undefined;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const dev = require('../dev/moneyPreview') as typeof import('../dev/moneyPreview');
    return dev.installMoneyDevLinks((screen) => {
      if (screen === 'vip') void openMembership({ devPreview: true });
      else if (screen === 'supplies') RootNavigation.navigate('Store', { store: 'shark-shop', tab: 'supplies' });
      else if (screen === 'pass') RootNavigation.navigate('SharkPass');
      else if (screen === 'store') RootNavigation.navigate('Store', { store: 'shark-shop', tab: 'gear' });
      else if (screen === 'postwin') RootNavigation.navigate('PostWinRewardsPreview');
      else if (screen === 'gate') void (require('../components/GrownUpGate') as typeof import('../components/GrownUpGate')).devShowGateOffer();
      else RootNavigation.navigate('MoneyPreview', { screen });
    });
  }, [isReady, player?.id]);

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
