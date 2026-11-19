/**
 * Fix round w4 T038: when Picture games is turned on at the very start of a dealt Beat the Buzzer round
 * (its how-to card), the same try is dealt again as a picture game. Pure, so it is tested without a device.
 */
export interface PictureRedealInput {
  /** The ride sheet's state (RedeemRedeemableModal FlowState). */
  readonly flowState: string;
  /** The player's Picture games setting right now. */
  readonly pictureOnlyNow: boolean;
  /** This try was already started as picture games. */
  readonly pictureOnlyTry: boolean;
  /** The server attempt, if any. */
  readonly attempt: { readonly status?: string | null; readonly game?: string | null } | null | undefined;
  /** A spend or a re-deal is already on its way. */
  readonly busy: boolean;
}

/** Only an open, still-started trivia try whose player just turned Picture games on, and only once. */
export function shouldRedealPicture(i: PictureRedealInput): boolean {
  return i.flowState === 'minigame' && i.pictureOnlyNow && !i.pictureOnlyTry && !i.busy
    && i.attempt?.status === 'started' && i.attempt?.game === 'trivia';
}
