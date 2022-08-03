import client from '../../client';
import Toast from 'react-native-root-toast';

export default async function updateUser(data) {
  try {
    const response = await client.put('/me', data);

    return response.data.data;
  } catch (error) {
    Toast.show(error.response.data.message, {
      duration: Toast.durations.LONG,
      position: Toast.positions.TOP,
      animation: true,
      delay: 0,
    });

    throw error;
  }
}
