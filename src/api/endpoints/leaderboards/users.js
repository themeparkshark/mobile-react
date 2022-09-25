import client from '../../client';

export default async function leaderboardUsers(leaderboard, page) {
  const response = await client.get(`/leaderboards/${leaderboard}/users`, {
    params: {
      page,
    },
  });

  return response.data;
}
