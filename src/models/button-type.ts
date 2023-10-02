import { PermissionEnums } from './permission-enums';

export interface ButtonType {
  readonly image: any;
  readonly onPress: () => void;
  readonly text?: string;
  readonly show?: boolean;
  readonly disabled?: boolean;
  readonly permission?: PermissionEnums;
}
