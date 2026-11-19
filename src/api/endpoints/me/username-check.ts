import client from '../../client';

/** What the server says about a shark name before it is saved (fix w4 T174). */
export type UsernameCheck = { readonly available: boolean; readonly yours: boolean };

/**
 * GET /api/me/username-check: is this name free (or already this player's)? Null when the answer is
 * unknown (an older server without the route, a slow or failed request): the save then decides, as
 * before. The server's own sentence is never read here, so it can never reach the screen.
 */
export default async function checkUsername(username: string): Promise<UsernameCheck | null> {
  try {
    const { data } = await client.get<{ data?: { available?: unknown; yours?: unknown } }>('/me/username-check',
      { params: { username }, timeout: 4000 });
    const body = data?.data;
    if (!body || typeof body.available !== 'boolean') return null;
    return { available: body.available, yours: body.yours === true };
  } catch {
    return null;
  }
}
