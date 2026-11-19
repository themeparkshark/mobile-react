/**
 * The ride name on the small tab under PLAY! (fix pass w4, N11): always one line. Most names fit as they are
 * (the tab shrinks its text to fit, down to 70%). A very long name keeps its own main words, never "...":
 * "Meet Cinderella and a Visiting Princess at Princess Fairytale Hall" reads "Princess Fairytale Hall", and
 * "Monsters Unchained: The Frankenstein Experiment" reads "Monsters Unchained". The full name stays on the coin
 * card and in the tab's spoken label. Pure, unit tested in tools/tests/fix-w4-home.test.cjs.
 */
export const PLAY_CAPTION_MAX = 40;

export function playCaptionName(name: string | null | undefined): string {
  const full = String(name ?? '').replace(/\s+/g, ' ').trim();
  if (full.length <= PLAY_CAPTION_MAX) return full;
  // A meet and greet names its place last ("Meet ... at Princess Fairytale Hall").
  const meet = /^meet\b.*\bat (?:the )?(.+)$/i.exec(full);
  if (meet && meet[1].length >= 6 && meet[1].length <= PLAY_CAPTION_MAX) return meet[1];
  // A ride with a subtitle keeps its title ("A Pirate's Adventure ~ Treasures of the Seven Seas").
  const title = full.split(/\s*(?::|~| - | – )\s*/)[0];
  if (title && title.length >= 6 && title.length < full.length && title.length <= PLAY_CAPTION_MAX) return title;
  return full;
}
