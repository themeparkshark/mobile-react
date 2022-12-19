import client from '../../client';

export default async function deleteUser(): Promise<[]> {
  const { data } = await client.delete<[]>('/me');

  return data;
}
