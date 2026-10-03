export interface NotificationType {
  readonly id: string;
  readonly type?: string;
  readonly content: {
    readonly message: string;
    readonly image: string | null;
    readonly excerpt?: string | null;
    readonly route?: {
      readonly screen: string;
      readonly params: any;
    } | null;
  };
  readonly created_at: string;
  readonly read_at: string | null;
  /** Social v2 (optional on older servers). */
  readonly kind?: 'friend_request' | 'friend_accepted' | 'compliment' | 'reply' | 'park_coins' | 'prize' | 'news';
  readonly actor_id?: number | null;
  /** The actor's own shark (server composite). */
  readonly actor_avatar_url?: string | null;
  readonly friend_status?: 'friends' | 'incoming' | 'outgoing' | 'blocked' | 'none' | null;
}
