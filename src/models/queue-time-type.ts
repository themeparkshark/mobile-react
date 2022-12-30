export interface QueueTimeType {
  readonly id: number;
  readonly ride: string;
  readonly wait_time: number;
  readonly is_open: boolean;
  readonly last_check_at: string;
}
