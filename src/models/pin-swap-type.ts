import { PinType } from './pin-type';

export interface PinSwapType {
  readonly id: number;
  readonly pin: PinType;
  readonly held_from: string;
  readonly held_to: string;
}
