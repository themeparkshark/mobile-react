export interface EntryType {
  readonly id: number;
  readonly date: string;
  readonly featured_image: string;
  readonly featured_image_full?: string;
  readonly title: string;
  readonly url: string;
  readonly content?: string;
  readonly excerpt?: string;
}
