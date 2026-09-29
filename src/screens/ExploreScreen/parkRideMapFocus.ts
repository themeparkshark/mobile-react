import type { TaskType } from '../../models/task-type';

export interface ParkRideMapFocus {
  readonly parkId: number;
  readonly task: TaskType;
}

/** A checklist handoff may focus only a mapped ride in the detected park. */
export function rideFocusForPark(focus: ParkRideMapFocus | undefined,
  currentParkId: number | null | undefined): TaskType | null {
  if (!focus || currentParkId == null || Number(currentParkId) !== Number(focus.parkId)) return null;
  if (!String(focus.task.latitude ?? '').trim() || !String(focus.task.longitude ?? '').trim()) return null;
  const latitude = Number(focus.task.latitude);
  const longitude = Number(focus.task.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
    Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return focus.task;
}
