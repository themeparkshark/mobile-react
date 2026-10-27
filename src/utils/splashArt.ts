// Which splash art the JS splash shows.
//
// The server theme can name its own splash image (splash_screen_url). The 1.7.3
// theme still points at the old splash, which has a green light-sword, a blue
// starred wizard hat, a castle and a ringed globe. That art is retired for IP
// safety: when the theme names it, the bundled art wins. Any other https image
// the theme names is still used, so a new server splash needs no app update.
export const RETIRED_SPLASH_ASSETS: readonly string[] = [
  'PuwNJoYcQVIbyy487jU41dMfHc5gHUBlXeVzZ93N',
];

export function themeSplashUri(url: string | null | undefined): string | null {
  if (typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!/^https:\/\//i.test(trimmed)) return null;
  if (RETIRED_SPLASH_ASSETS.some((id) => trimmed.includes(id))) return null;
  return trimmed;
}
