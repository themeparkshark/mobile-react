/**
 * One park name everywhere (fix w3 T132): the park's everyday name, the one the shelf header
 * prints. "Disneyland Park" says "Disneyland", "Disney California Adventure Park" says
 * "California Adventure", "Universal's Islands of Adventure" says "Islands of Adventure".
 * The server's display_name wins when it has one; otherwise the long name is shortened the
 * same way, so the guide card, the raid banner, Profile and the shelf never disagree.
 */
export function shortParkName(name: string | null | undefined): string {
  let out = String(name ?? '').trim();
  if (!out) return 'the park';
  out = out.replace(/\s+(Theme\s+)?Park$/i, '');
  out = out.replace(/^(Disney['’]s|Disney|Universal['’]s)\s+(?=\S)/i, '');
  return out.trim() || String(name).trim();
}

export function parkLabel(park: { readonly name?: string | null; readonly display_name?: string | null } | null | undefined): string {
  const display = typeof park?.display_name === 'string' ? park.display_name.trim() : '';
  return display || shortParkName(park?.name);
}
