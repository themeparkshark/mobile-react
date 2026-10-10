/**
 * Stand-in for the money stream's <CoinTopUpOffer /> (src/components/money/CoinTopUpOffer.tsx on
 * claude/fb-money, not on this branch yet). Same props; draws nothing. At integration, the try-on
 * imports the real component instead (one line in TryOnSheet.tsx) and this file is deleted.
 */
export type CoinTopUpOfferProps = {
  readonly need: number;
  readonly reason: 'gear' | string;
  readonly tone?: 'onBlue' | 'onLight';
  readonly onDone?: () => void;
};

export default function CoinTopUpOffer(_props: CoinTopUpOfferProps) {
  return null;
}
