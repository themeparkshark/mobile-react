import { Button, Text } from 'react-native';
import completeTask from '../api/endpoints/me/tasks/complete-task';
import Modal from './Modal';

export default function RedeemModal({ redeemable, trigger }) {
  const completeRedeemable = async () => {
    await completeTask(redeemable);
  };

  return (
    <Modal trigger={trigger}>
      <Text>Congratulations</Text>
      <Text>{redeemable?.name}</Text>
      <Text>Experience: {redeemable?.experience}</Text>
      <Text>Coins: {redeemable?.coins}</Text>
      <Button
        title="Collect"
        onPress={() => {
          completeRedeemable();
        }}
      />
    </Modal>
  );
}
