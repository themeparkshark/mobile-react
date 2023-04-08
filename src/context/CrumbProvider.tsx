import { createContext, Dispatch, FC, ReactNode, useState } from 'react';

export interface CrumbContextType {
  readonly crumbs: {
    readonly errors: {
      readonly item_purchased: string;
      readonly item_redeemed: string;
      readonly max_compliments_created: string;
      readonly not_enough_coins: string;
      readonly not_enough_keys: string;
      readonly pin_swap_unavailable: string;
      readonly pin_required: string;
    };
    readonly labels: {
      readonly checking_again: string;
      readonly clearance: string;
      readonly coins: string;
      readonly keys: string;
      readonly park_tasks: string;
      readonly read_more: string;
      readonly slow_connectivity: string;
      readonly task_list_modal_heading: string;
      readonly username_approval: string;
      readonly vault_cost: string;
      readonly verified_user: string;
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
      readonly no_recent_activity: string;
      readonly no_visited_parks: string;
      readonly not_at_a_park: string;
    };
  };
  readonly setCrumbs: Dispatch<any>;
}

export const CrumbContext = createContext<CrumbContextType>(
  {} as CrumbContextType
);

export const CrumbProvider: FC<{ children: ReactNode }> = ({ children }) => {
  const [crumbs, setCrumbs] = useState<any>({});

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
