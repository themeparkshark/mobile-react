import { ThemeType } from '../../../models/theme-type';
import client from '../../client';
import { getWithLastGood } from '../../lastGood';
import bundledTheme from '../../defaults/theme.json';

function unwrapTheme(body: unknown): ThemeType | undefined {
  const data = (body as { data?: { id?: unknown } } | undefined)?.data;
  return data && typeof data === 'object' && data.id !== undefined ? (data as ThemeType) : undefined;
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
