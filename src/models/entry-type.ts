export interface EntryType {
  readonly category: {
    readonly id: number;
    readonly name: string;
  }[];
  readonly content: string;
  readonly author: {
    readonly id: number;
    readonly name: string;
  };
  readonly featured_image: {
    readonly width: number;
    readonly height: number;
    readonly uri: string;
  }[];
  readonly full_headline: string;
  readonly headline: string;
  readonly id: number;
  readonly published_at: string;
  readonly tags: {
    readonly id: number;
    readonly name: string;
  }[];
}
