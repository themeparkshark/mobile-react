/**
 * Where the Share buttons inside modals (coin level-up, Crowning, Home Hunt podium) are on.
 * Pure, so the rule is unit tested: the 'testflight' channel (internal group, real-finger
 * tap testing) and dev builds that opt in. Never 'production' or any other channel.
 */
export function shareInModalsFor(dev: boolean, devFlag: string | undefined, channel: string | null | undefined): boolean {
  if (channel === 'testflight') return true;
  return dev && devFlag === '1';
}
