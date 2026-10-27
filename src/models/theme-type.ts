import { CurrencyType } from './currency-type';

export interface ThemeType {
  readonly bottom_bar_url: string;
  readonly currency: CurrencyType;
  // No splash_screen_url: the launch always uses the bundled splash (its art carries the game
  // title, and server art swapping in mid-launch read as a flash). Seasonal splash art ships in the app.
  readonly top_bar_url: string;
  readonly tracks: {
    readonly id: number;
    readonly track_url: string;
  }[];
}
