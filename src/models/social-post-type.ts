export interface SocialPostType {
  readonly id: number;
  readonly post_id: number;
  readonly source: string;
  readonly title: string;
  readonly description: string;
  readonly image_url: string;
  readonly permalink: string;
  readonly post_created_at: string;
}
