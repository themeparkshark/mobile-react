/**
 * The treat meter and the jar (T8, arcade plan Nov 20 2026), pure. Every 3 treats drop 1 Ticket into a jar that
 * holds 20 home Tickets; past that a treat's Ticket turns into 25 Shark Coins. 4 treat Tickets a day.
 * Read from the treat catch answer (treat_meter, home_jar, home_tickets_today, jar_overflow_coins). Today's
 * server sends none of them: null, and the catch card is as today.
 */
export interface TreatJarAnswer {
  readonly treat_meter?: { readonly pips?: number | null; readonly of?: number | null; readonly filled?: boolean | null } | null;
  readonly home_jar?: { readonly held?: number | null; readonly cap?: number | null; readonly full?: boolean | null } | null;
  readonly home_tickets_today?: { readonly earned?: number | null; readonly cap?: number | null } | null;
  readonly jar_overflow_coins?: number | null;
  readonly rewards?: { readonly tickets?: number | null } | null;
}

export interface TreatJarModel {
  readonly pips: number;
  readonly of: number;
  /** This catch filled the meter and a Ticket dropped into the jar. */
  readonly dropped: boolean;
  readonly held: number;
  readonly cap: number;
  readonly full: boolean;
  /** Today's treat Tickets are all earned. */
  readonly capped: boolean;
  readonly overflowCoins: number;
  /** The one line under the pictures (null: the pictures say it). */
  readonly line: string | null;
  readonly a11y: string;
}

export const JAR_FULL_LINE = 'Jar full! Save them for your park day';
export const TREAT_CAP_LINE = "That's today's treat Tickets. More tomorrow!";

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : null);

export function treatJarModel(answer: TreatJarAnswer | null | undefined): TreatJarModel | null {
  const meter = answer?.treat_meter;
  const jar = answer?.home_jar;
  if (!meter && !jar) return null;
  const of = Math.max(1, n(meter?.of) ?? 3);
  const pips = Math.min(of, n(meter?.pips) ?? 0);
  const dropped = meter?.filled === true || (n(answer?.rewards?.tickets) ?? 0) > 0;
  const held = n(jar?.held) ?? 0;
  const cap = Math.max(1, n(jar?.cap) ?? 20);
  const full = jar?.full === true || held >= cap;
  const earned = n(answer?.home_tickets_today?.earned);
  const dayCap = n(answer?.home_tickets_today?.cap);
  const capped = earned != null && dayCap != null && dayCap > 0 && earned >= dayCap && !dropped;
  const overflowCoins = n(answer?.jar_overflow_coins) ?? 0;
  const line = full ? JAR_FULL_LINE : capped ? TREAT_CAP_LINE : null;
  const more = of - pips;
  const a11y = full ? `${JAR_FULL_LINE}.${overflowCoins ? ` Plus ${overflowCoins} Shark Coins.` : ''}`
    : capped ? TREAT_CAP_LINE
      : dropped ? `A Ticket dropped into your jar. ${held} of ${cap}.`
        : `${more} more treat${more === 1 ? '' : 's'} make 1 Ticket. ${held} in your jar.`;
  return { pips: dropped ? of : pips, of, dropped, held, cap, full, capped, overflowCoins, line, a11y };
}
