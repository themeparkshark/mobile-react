/**
 * MemberFlex on surfaces that show another player (Standings rows). Reads only what the
 * server sends with that player: `flex: { frame, vip, step }`. An older server sends none of
 * it, and then the row stays exactly as it is today (null). `is_subscribed` is never used
 * here, so nothing changes until the server opts a payload in.
 */
export interface MemberFlexFields {
  readonly frame: string | null;
  readonly vip: boolean;
  readonly step: number | null;
}

export function memberFlexOf(player: unknown): MemberFlexFields | null {
  const flex = (player as { flex?: unknown } | null | undefined)?.flex;
  if (!flex || typeof flex !== 'object') return null;
  const f = flex as { frame?: unknown; vip?: unknown; step?: unknown };
  const frame = typeof f.frame === 'string' && f.frame ? f.frame : null;
  const vip = f.vip === true;
  const step = Number.isFinite(Number(f.step)) && Number(f.step) > 0 ? Math.floor(Number(f.step)) : null;
  if (!frame && !vip && !step) return null;
  return { frame, vip, step };
}
