import { CurrencyType } from './currency-type';

export interface CatalogType {
  readonly id: number;
  readonly currencies: CurrencyType[];
  readonly name: string;
  readonly promotion_image_url: string;
}
