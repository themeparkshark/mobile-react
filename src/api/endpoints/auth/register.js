import client from '../../client-unauthenticated';

export default async function login(username, email, password, passwordConfirmation) {
  const response = await client.post('/register', {
    username,
    email,
    password,
    'password_confirmation': passwordConfirmation,
  });

  return response.data;
}
