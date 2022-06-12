import client from '../../client';

export default async function login(credential) {
  const response = await client.post('/auth/login', {
    credential,
  });

  return response.data;
}
