import { ThemeType } from '../../../models/theme-type';
import client from '../../client';
import { getWithLastGood } from '../../lastGood';
import bundledTheme from '../../defaults/theme.json';

function unwrapTheme(body: unknown): ThemeType | undefined {
  const data = (body as { data?: { id?: unknown } } | undefined)?.data;
  if (!data || typeof data !== 'object' || data.id === undefined) return undefined;
  // ThemeProvider maps the tracks at the app root: a theme without a list
  // gets an empty one instead of crashing launch.
  const tracks = (data as { tracks?: unknown }).tracks;
  return (Array.isArray(tracks) ? data : { ...data, tracks: [] }) as ThemeType;
}

export default async function getCurrentTheme(): Promise<ThemeType | undefined> {
  const { data } = await getWithLastGood<ThemeType>({
    key: 'theme',
    request: () => client.get('/current-theme', { timeout: 10000 }),
    unwrap: unwrapTheme,
    bundled: bundledTheme as unknown as ThemeType,
  });
  return data;
}
