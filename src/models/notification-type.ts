export interface NotificationType {
  readonly id: string;
  readonly type: string;
  readonly content: {
    readonly message: string;
    readonly image: string | null;
    readonly route: {
      readonly screen: string;
      readonly params: any;
    };
  };
  readonly created_at: string;
  readonly read_at: string;
}
