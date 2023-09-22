import { CurrencyType } from './currency-type';

export interface ThemeType {
  readonly bottom_bar_url: string;
  readonly currency: CurrencyType;
  readonly explore_screen_music_url: string;
  readonly show_pumpkin_currency: boolean;
  readonly top_bar_url: string;
}
