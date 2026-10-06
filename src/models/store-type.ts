export interface StoreType {
  readonly background_url: string;
  readonly current_catalog_id: number;
  readonly icon_url: string;
  readonly id: string;
  readonly is_secret_store: boolean;
  readonly name: string;
  /** Stable key for stores code looks up (newer servers). */
  readonly slug?: string | null;
  /** A limited event shop (the Halloween Shop): tag, subtitle and when it closes. */
  readonly event?: StoreEventInfo | null;
}

export interface StoreEventInfo {
  readonly tag: string;
  readonly title: string;
  readonly subtitle: string;
  readonly ends_at: string;
  readonly only_at_event: boolean;
}
