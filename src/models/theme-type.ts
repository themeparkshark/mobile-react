import { CurrencyType } from './currency-type';
import { StoreType } from './store-type';

export interface ThemeType {
  readonly bottom_bar_url: string;
  readonly currency: CurrencyType;
  readonly show_pumpkin_currency: boolean;
  readonly splash_screen_url;
  readonly top_bar_url: string;
  readonly store: StoreType;
}
