export default (redeemables, location) => {
  const distance = 0.0005;

  if (redeemables === null) {
    return false;
  }

  const coin = redeemables.coins.find((coin) => {
    return (
      coin.latitude - location.latitude <= distance
      && coin.longitude - location.longitude <= distance
    );
  });

  if (coin) {
    return {
      model: coin,
      type: 'coin',
    }
  }

  const item = redeemables.items.find((item) => {
    return (
      item.pivot.latitude - location.latitude <= distance
      && item.pivot.longitude - location.longitude <= distance
    );
  });

  if (item) {
    return {
      model: item,
      type: 'item',
    }
  }

  const secretTask = redeemables.secret_tasks.find((task) => {
    return (
      task.latitude - location.latitude <= distance
      && task.longitude - location.longitude <= distance
    );
  });

  if (secretTask) {
    return {
      model: secretTask,
      type: 'secret_task',
    }
  }

  const task = redeemables.tasks.find((task) => {
    return (
      task.latitude - location.latitude <= distance
      && task.longitude - location.longitude <= distance
    );
  });

  if (task) {
    return {
      model: task,
      type: 'task',
    }
  }

  return null;
};
