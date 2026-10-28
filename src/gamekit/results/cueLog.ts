/**
 * cueLog.ts: the capture screen's finish cue line, so a silent capture still
 * proves what a results card sounded like (Dustin's simulators stay muted).
 *
 * The log starts at the shell's one finish haptic and keeps every cue after
 * it. A cue played with a pitch is written with it (fx.reveal@3), so three
 * star stamps read as three different stars, not one sound played twice.
 * Repeats in a row fold into one entry with a count (ui.tap x6).
 *
 * Pure, no React, so tools/tests can load it directly.
 */

/** Most cues one run keeps (a capture never grows without bound). */
export const CUE_LOG_CAP = 60;

/** One cue name as the log writes it: the name, plus @pitch when one was asked for. */
export function cueName(name: string, opts?: { pitch?: number } | null): string {
  const pitch = opts?.pitch;
  return typeof pitch === 'number' && Number.isFinite(pitch) && pitch !== 0 ? `${name}@${pitch}` : name;
}

/** The cues from the last finish haptic on (the whole cue list when none was felt). */
export function finishCues(cues: readonly string[], finishAt: number): string[] {
  const from = finishAt >= 0 && finishAt < cues.length ? finishAt : 0;
  return cues.slice(from);
}

/** "haptic success, fx.reward, fx.reveal, fx.reveal@3, ui.tap x6": repeats in a row fold into a count. */
export function finishCueLine(cues: readonly string[]): string {
  const out: { name: string; n: number }[] = [];
  for (const c of cues) {
    const last = out[out.length - 1];
    if (last && last.name === c) last.n += 1;
    else out.push({ name: c, n: 1 });
  }
  return out.map((e) => (e.n > 1 ? `${e.name} x${e.n}` : e.name)).join(', ') || 'silent';
}
