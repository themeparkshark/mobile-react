export default (redeemables, location) => {
  if (redeemables === null) {
    return false;
  }

  const redeemable = [
    ...redeemables.coins,
    ...redeemables.tasks,
    ...redeemables.pins,
  ].find((redeemable) => {
    return (
      redeemable.latitude - location.latitude <= 0.0006 &&
      redeemable.longitude - location.longitude <= 0.0006
    );
  });

  if (!redeemable) {
    return null;
  }

  return redeemable;
};
