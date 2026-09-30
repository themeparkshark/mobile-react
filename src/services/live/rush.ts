import type { LiveRush } from '../../api/endpoints/parks/live';
import type { TaskType } from '../../models/task-type';

/** A live Rush on a ride. `wait` is the live posted wait (the Rush window was fixed when it opened). */
export type RushPick = { readonly task: TaskType; readonly rush: LiveRush; readonly wait: number };
