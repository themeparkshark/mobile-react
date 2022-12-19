import { PinType } from './pin-type';

export interface PinCollectionType {
  readonly collected_pins_count: number;
  readonly id: number;
  readonly name: string;
  readonly pin: PinType;
  readonly pins: PinType[];
  readonly pins_count: number;
}
