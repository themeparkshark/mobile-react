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
      readonly add_a_comment: string;
      readonly archived_tasks: string;
      readonly checking_again: string;
      readonly choose_daily_gift: string;
      readonly clearance: string;
      readonly coins: string;
      readonly copyright: string;
      readonly enter_a_username: string;
      readonly experience: string;
      readonly experience_level: string;
      readonly find_friends: string;
      readonly free_trial: string;
      readonly keys: string;
      readonly loading: string;
      readonly load_more_replies: string;
      readonly membership: string;
      readonly membership_benefits: string[];
      readonly membership_terms: string;
      readonly park_completion_rate: string;
      readonly park_tasks: string;
      readonly pin_packs: string;
      readonly purchase_membership: string;
      readonly purchase_membership_additional: string;
      readonly read_more: string;
      readonly reply: string;
      readonly restore_purchases: string;
      readonly search_for_a_user: string;
      readonly secret_tasks: string;
      readonly select_a_pin: string;
      readonly skip_for_now: string;
      readonly slow_connectivity: string;
      readonly start_free_trial: string;
      readonly submit: string;
      readonly subscribed_user: string;
      readonly tasks: string;
      readonly task_list_modal_heading: string;
      readonly task_unlocks: string;
      readonly trade_expiration: string;
      readonly trade_pin: string;
      readonly vault_cost: string;
      readonly verified_user: string;
      readonly view_all_friends: string;
      readonly watch_social_posts: string;
      readonly welcome: string;
      readonly your_friends: string;
      readonly your_parks: string;
      readonly your_statistics: string;
    };
    readonly messages: {
      readonly compliment_created: string;
      readonly friend_removed: string;
      readonly friend_request_accepted: string;
      readonly friend_request_sent: string;
      readonly item_purchased: string;
      readonly pin_swap_created: string;
      readonly report_created: string;
    };
    readonly prompts: {
      readonly accept_friend_request: string;
      readonly compliment: string;
      readonly pin_swap: string;
      readonly purchase_item: string;
      readonly redeem_item: string;
      readonly remove_friend: string;
      readonly send_friend_request: string;
      readonly permissions: {
        readonly create_threads: string;
        readonly redeem_coin_codes: string;
        readonly trade_pins: string;
        readonly view_arcade: string;
        readonly view_profile: string;
        readonly watch_content: string;
      };
      readonly report_username: string;
    };
    readonly urls: {
      readonly privacy_policy: string;
      readonly shop: string;
      readonly terms: string;
    };
    readonly warnings: {
      readonly must_be_signed_in: string;
      readonly must_grant_permissions: string;
      readonly no_friends: string;
      readonly no_friend_suggestions: string;
      readonly no_notifications: string;
      readonly no_permissions_granted: string;
      readonly no_recent_activity: string;
      readonly no_visited_parks: string;
      readonly not_at_a_park: string;
      readonly not_signed_in: string;
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
