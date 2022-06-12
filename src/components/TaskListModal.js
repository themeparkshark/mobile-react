import { Text } from 'react-native';
import Modal from './Modal';

export default function TaskListModal({ redeemables, trigger }) {
  return (
    <Modal trigger={trigger}>
      {redeemables?.tasks.map((task) => {
        return <Text key={task.id}>{task.name}</Text>;
      })}
    </Modal>
  );
}
