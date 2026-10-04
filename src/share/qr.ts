/** Per-kind QR codes (tools/share-studio/build-qr.py). Do not edit by hand. */
import type { FlexKind } from './types';

export const QR_BY_KIND: Readonly<Record<FlexKind, number>> = {
  crowned: require('../../assets/images/share/qr/crowned.png'),
  find: require('../../assets/images/share/qr/find.png'),
  ride_photo: require('../../assets/images/share/qr/ride_photo.png'),
  set_complete: require('../../assets/images/share/qr/set_complete.png'),
  boss_win: require('../../assets/images/share/qr/boss_win.png'),
  stamp: require('../../assets/images/share/qr/stamp.png'),
  coin_level: require('../../assets/images/share/qr/coin_level.png'),
  standings: require('../../assets/images/share/qr/standings.png'),
  fright_night: require('../../assets/images/share/qr/fright_night.png'),
  fright_badge: require('../../assets/images/share/qr/fright_badge.png'),
  fright_lifetime: require('../../assets/images/share/qr/fright_lifetime.png'),
  ride_coin: require('../../assets/images/share/qr/ride_coin.png'),
  streak: require('../../assets/images/share/qr/streak.png'),
  level_up: require('../../assets/images/share/qr/level_up.png'),
  title: require('../../assets/images/share/qr/title.png'),
  park_day: require('../../assets/images/share/qr/park_day.png'),
};
