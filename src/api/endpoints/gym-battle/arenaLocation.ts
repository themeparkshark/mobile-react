import * as Location from 'expo-location';

export async function arenaLocation(): Promise<{ latitude: number; longitude: number }> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted) permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Allow location access to play in the park arena.');
  }

  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const position = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('Could not get a fresh location. Try again in the park.')), 12000);
      }),
    ]);
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
