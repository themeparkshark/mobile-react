import client from '../../client';
import { getWithLastGood } from '../../lastGood';
import bundledCrumbs from '../../defaults/crumbs.json';

const GROUPS = ['labels', 'errors', 'messages', 'prompts', 'urls', 'warnings'] as const;

function unwrapCrumbs(body: unknown): CrumbsType | undefined {
  const data = (body as { data?: Record<string, unknown> } | undefined)?.data;
  if (!data || typeof data !== 'object' || typeof data.labels !== 'object' || typeof data.errors !== 'object') {
    return undefined;
  }
  // A partial payload still gets every group, so lookups never hit undefined.
  const complete: Record<string, unknown> = { ...data };
  for (const group of GROUPS) {
    if (!complete[group] || typeof complete[group] !== 'object') complete[group] = {};
  }
  return complete as unknown as CrumbsType;
}

export default async function getCrumbs(): Promise<CrumbsType> {
  const { data } = await getWithLastGood<CrumbsType>({
    key: 'crumbs',
    // Splash waits for this request; do not strand sign-in on a slow API.
    request: () => client.get('/crumbs', { timeout: 10000 }),
    unwrap: unwrapCrumbs,
    bundled: bundledCrumbs as unknown as CrumbsType,
  });
  return data;
}
