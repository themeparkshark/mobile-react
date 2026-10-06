import type { ParkDayRecap } from '../api/endpoints/me/park-day-recap';

/** Surface confirmed activity; empty queue sessions are not a brag stat. */
export function parkDayShareMetrics(recap: ParkDayRecap) {
  return [
    { value: recap.new_coins, label: recap.new_coins === 1 ? 'new ride coin' : 'new ride coins' },
    { value: recap.coin_upgrades, label: recap.coin_upgrades === 1 ? 'upgrade' : 'upgrades' },
    { value: recap.eligible_line_minutes, label: 'min in line' },
    { value: recap.ride_parts_earned, label: 'Ride Parts' },
    { value: recap.ride_wins, label: recap.ride_wins === 1 ? 'ride win' : 'ride wins' },
    { value: recap.park_project_points, label: 'Project points' },
  ].filter(stat => Number.isFinite(stat.value) && stat.value > 0).slice(0, 3);
}

/** The installed iOS view-shot renderer uses device points; Android uses pixels. */
export function parkDayCaptureSize(platform: string, density: number) {
  const scale = platform === 'ios' && Number.isFinite(density) && density > 0 ? density : 1;
  return { width: 1080 / scale, height: 1920 / scale };
}
