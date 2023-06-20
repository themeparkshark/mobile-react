export interface ApiPaginatedResponseType<T> {
  readonly data: T;
  readonly links: {
    readonly first: string;
    readonly last?: string;
    readonly prev: string;
    readonly next?: string;
  };
  readonly meta: {
    readonly current_page: number;
    readonly from: number;
    readonly last_page: number;
    readonly path: string;
    readonly per_page: number;
    readonly to: number;
    readonly total: number;
  };
}
