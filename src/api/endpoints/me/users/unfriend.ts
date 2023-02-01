import { UserType } from '../../../../models/user-type';
import client from '../../../client';

export default async function unfriend(user: UserType) {
  await client.delete(`/me/users/${user.id}/unfriend`);
}
