import client from '../../../client';
import { UserType } from '../../../../models/user-type';

export default async function unfriend(user: UserType) {
  await client.delete(`/me/users/${user.id}/unfriend`);
}
