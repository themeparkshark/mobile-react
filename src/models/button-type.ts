export interface ButtonType {
  readonly image: any;
  readonly onPress: () => void;
  readonly text?: string;
  readonly show?: boolean;
}
