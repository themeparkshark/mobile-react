import client from '../../client';

export default async function deletePlayer(): Promise<[]> {
  const { data } = await client.delete<[]>('/me');

  return data;
}
