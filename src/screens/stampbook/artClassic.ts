/**
 * Preview build: the production API sends no art URLs yet, only the classic
 * image_key. These are the bundled classic stamps for those keys.
 */
export const CLASSIC_ART: Readonly<Record<string, number>> = {
  'stamp-01': require('../../../assets/images/stamps/stamp-01.png'),
  'stamp-02': require('../../../assets/images/stamps/stamp-02.png'),
  'stamp-03': require('../../../assets/images/stamps/stamp-03.png'),
  'stamp-04': require('../../../assets/images/stamps/stamp-04.png'),
  'stamp-05': require('../../../assets/images/stamps/stamp-05.png'),
  'stamp-06': require('../../../assets/images/stamps/stamp-06.png'),
  'stamp-07': require('../../../assets/images/stamps/stamp-07.png'),
  'stamp-08': require('../../../assets/images/stamps/stamp-08.png'),
  'stamp-09': require('../../../assets/images/stamps/stamp-09.png'),
  'ride-passport-complete-v1': require('../../../assets/images/stamps/ride-passport-complete-v1.png'),
  'first-ride-coin-v1': require('../../../assets/images/stamps/first-ride-coin-v1.png'),
};
