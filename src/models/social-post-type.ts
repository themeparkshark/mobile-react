export interface SocialPostType {
  readonly id: number;
  readonly title: string;
  readonly image_url: string;
  readonly permalink: string;
  readonly has_watched: boolean;
  // Live Watch feed fields (backend claude/watch-youtube-live). Optional so the
  // app still renders against an API that does not send them yet.
  readonly video_id?: string;
  readonly thumbnail_url?: string;
  readonly published_at?: string;
  readonly is_short?: boolean;
  readonly duration_seconds?: number | null;
}
