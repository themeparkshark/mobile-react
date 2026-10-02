/**
 * Lagoon Chart v0 (design 4.1, 4.5, 0.A.12): 24 nodes in two launch chapters,
 * medals per node, a pencil sketch on clear and ink on 3 shells. A chart node
 * is one voyage (10 to 40 s), so a queue session can push the map a node or two.
 *
 * Chapter 1 Current Cove (currents) and chapter 2 Tide Pools (tide, sandbars,
 * tread). Node 1 of each chapter is its teach board; nodes 2 to 11 ramp from
 * Trick Shots through Standard boards by difficulty grade; node 12 is the
 * chapter's Deep board. Chapter 2 opens after 10 of chapter 1's 12 clears
 * (Clear shells gate progress; Par, Golden and Author are mastery only).
 *
 * v0 picks the nodes from the generator's library by rule (curated: false);
 * the curators replace them with hand-edited set pieces (Monument Valley rule,
 * 0.A.12) without touching this file's shape.
 */

import { CQ_LIBRARY } from './boards.v3.client';
import type { AhaTag, Board } from './rules';

export interface ChartNode {
  readonly id: string;
  readonly chapter: 1 | 2;
  /** 1..12 within the chapter. */
  readonly index: number;
  readonly boardId: string;
  readonly name: string;
  readonly ahaTag?: AhaTag;
  readonly curated: boolean;
}

export interface ChartChapter {
  readonly chapter: 1 | 2;
  readonly name: string;
  readonly nodes: readonly ChartNode[];
}

const live = (b: Board) => !b.retired && !b.teach;
const byGrade = (a: Board, b: Board) => (a.grade ?? a.par) - (b.grade ?? b.par) || a.id.localeCompare(b.id);

function pickChapter(chapter: 1 | 2): ChartNode[] {
  const tide = chapter === 2;
  const teach = CQ_LIBRARY.find((b) => b.id === (tide ? 'T2' : 'T1')) as Board;
  const tricks = CQ_LIBRARY.filter((b) => live(b) && b.slot === 'trick' && (tide ? b.P > 0 : b.P === 0)).sort(byGrade);
  const stds = CQ_LIBRARY.filter((b) => live(b) && b.slot === 'standard' && b.set === (tide ? 'CT' : 'C') && !!b.ahaTag).sort(byGrade);
  const deeps = CQ_LIBRARY.filter((b) => live(b) && b.slot === 'treasure' && b.set === (tide ? 'CT' : 'C') && !!b.ahaTag && b.band === 'rookie').sort(byGrade);
  // Ramp: 4 Trick Shots (one per tag where possible), then 6 Standard boards spread across the grade range.
  const seenTags = new Set<string>();
  const trickPick: Board[] = [];
  for (const b of tricks) { if (trickPick.length >= 4) break; if (!seenTags.has(b.ahaTag ?? '')) { seenTags.add(b.ahaTag ?? ''); trickPick.push(b); } }
  for (const b of tricks) { if (trickPick.length >= 4) break; if (!trickPick.includes(b)) trickPick.push(b); }
  const stdPick: Board[] = [];
  for (let k = 0; k < 6 && stds.length; k++) stdPick.push(stds[Math.min(stds.length - 1, Math.floor((k * stds.length) / 6))]);
  const deep = deeps.find((b) => (tide ? b.ahaTag === 'wait' || b.ahaTag === 'low-road' : b.ahaTag === 'chain')) ?? deeps[0];
  const boards = [teach, ...trickPick, ...stdPick, deep].filter(Boolean).slice(0, 12);
  return boards.map((b, i) => ({
    id: `ch${chapter}-${String(i + 1).padStart(2, '0')}`, chapter, index: i + 1, boardId: b.id,
    name: b.title ?? b.name, ahaTag: b.ahaTag, curated: !!b.teach,
  }));
}

export const CHART_V0: readonly ChartChapter[] = [
  { chapter: 1, name: 'Current Cove', nodes: pickChapter(1) },
  { chapter: 2, name: 'Tide Pools', nodes: pickChapter(2) },
];

export function chartNode(id: string): ChartNode | undefined {
  for (const ch of CHART_V0) for (const n of ch.nodes) if (n.id === id) return n;
  return undefined;
}

/** Clear shells needed in chapter 1 to open chapter 2 (Two Dots gate). */
export const CHAPTER_GATE = 10;

/** Is a chapter open, given node medals (medal >= 1 = cleared)? */
export function chapterOpen(chapter: 1 | 2, medals: Record<string, { medal: number }>): boolean {
  if (chapter === 1) return true;
  const ch1 = CHART_V0[0].nodes.filter((n) => (medals[n.id]?.medal ?? 0) >= 1).length;
  return ch1 >= CHAPTER_GATE;
}

/** Is a node playable: its chapter is open and (Hitman GO drip) the node before it is cleared. */
export function nodeOpen(node: ChartNode, medals: Record<string, { medal: number }>): boolean {
  if (!chapterOpen(node.chapter, medals)) return false;
  if (node.index === 1) return true;
  const prev = CHART_V0[node.chapter - 1].nodes[node.index - 2];
  return (medals[prev.id]?.medal ?? 0) >= 1;
}

/** Map mark per node: none, pencil sketch (cleared), ink (3 shells), plus the medal. */
export function markOf(entry: { medal: number; shells: number } | undefined): 'none' | 'sketch' | 'ink' {
  if (!entry || entry.medal < 1) return 'none';
  return entry.shells >= 3 ? 'ink' : 'sketch';
}
