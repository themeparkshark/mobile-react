import { createContext, Dispatch, FC, ReactNode, useState } from 'react';

export interface CrumbContextType {
  readonly crumbs: {
    readonly errors: {
      readonly item_purchased: string;
      readonly item_redeemed: string;
      readonly max_compliments_created: string;
      readonly not_enough_coins: string;
      readonly pin_swap_unavailable: string;
      readonly pin_required: string;
    };
    readonly messages: {
      readonly compliment_created: string;
      readonly friend_removed: string;
      readonly friend_request_accepted: string;
      readonly friend_request_sent: string;
      readonly item_purchased: string;
      readonly pin_swap_created: string;
    };
    readonly prompts: {
      readonly accept_friend_request: string;
      readonly compliment: string;
      readonly pin_swap: string;
      readonly purchase_item: string;
      readonly redeem_item: string;
      readonly remove_friend: string;
      readonly send_friend_request: string;
    };
    readonly warnings: {
      readonly no_friends: string;
      readonly no_friend_suggestions: string;
      readonly no_notifications: string;
      readonly no_visited_parks: string;
    };
  };
  readonly setCrumbs: Dispatch<any>;
}

export const CrumbContext = createContext<CrumbContextType>(
  {} as CrumbContextType
);

export const CrumbProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [crumbs, setCrumbs] = useState<any>([]);

  return (
    <CrumbContext.Provider
      value={{
        crumbs,
        setCrumbs,
      }}
    >
      {children}
    </CrumbContext.Provider>
  );
};
