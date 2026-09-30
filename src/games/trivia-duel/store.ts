/**
 * Local Trivia Duel memory: Fin's rank ladder, the offline seen-list LRU (120),
 * play counts (VS intro compression), streak carry within a LinePlay session,
 * fact-card album and the ghost shelf (your best run plus crew runs recorded
 * on this phone). Server state replaces the graded parts when the
 * /trivia-duel routes land (WS1); everything here is safe to lose.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FinRank } from './engine/config';
import { createRankState, type FinRankState } from './engine/finAI';
import { decodeGhost, encodeGhost, type GhostRecord } from './engine/match';

const KEY = 'tps.triviaDuel.v1';
const SEEN_MAX = 120;
const GHOSTS_MAX = 12;
/** 15 minutes idle ends a vs-Fin streak carry (5.4). */
const CARRY_TTL_MS = 15 * 60 * 1000;

export interface FactCard {
  id: string;
  fact: string;
  source?: string;
  tpsArticleUrl?: string;
  gold: boolean;
  at: number;
}

export interface DuelMemory {
  rank: FinRankState;
  seen: string[];
  plays: number;
  carry: { streak: number; shield: boolean; at: number } | null;
  best: number;
  album: FactCard[];
  ghosts: string[];
  vsSeen: number;
  buzzRulesSeen: boolean;
}

function fresh(): DuelMemory {
  return { rank: createRankState(), seen: [], plays: 0, carry: null, best: 0, album: [], ghosts: [], vsSeen: 0, buzzRulesSeen: false };
}

let cache: DuelMemory | null = null;

export async function loadMemory(): Promise<DuelMemory> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cache = raw ? { ...fresh(), ...(JSON.parse(raw) as Partial<DuelMemory>) } : fresh();
  } catch {
    cache = fresh();
  }
  return cache;
}

export function memorySync(): DuelMemory {
  return cache ?? fresh();
}

async function persist(): Promise<void> {
  if (!cache) return;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Local memory is a convenience; never break play over it.
  }
}

export async function updateMemory(fn: (m: DuelMemory) => void): Promise<DuelMemory> {
  const m = await loadMemory();
  fn(m);
  await persist();
  return m;
}

export function rememberSeen(m: DuelMemory, ids: readonly string[]): void {
  const set = m.seen.filter((id) => !ids.includes(id));
  m.seen = [...set, ...ids].slice(-SEEN_MAX);
}

export function activeCarry(m: DuelMemory, now: number): { streak: number; shield: boolean } {
  if (!m.carry || now - m.carry.at > CARRY_TTL_MS) return { streak: 0, shield: false };
  return { streak: m.carry.streak, shield: m.carry.shield };
}

export function addFactCards(m: DuelMemory, cards: FactCard[]): number {
  let added = 0;
  for (const c of cards) {
    const i = m.album.findIndex((x) => x.id === c.id);
    if (i < 0) { m.album.push(c); added++; } else if (c.gold && !m.album[i].gold) m.album[i] = { ...m.album[i], gold: true };
  }
  m.album = m.album.slice(-300);
  return added;
}

export function saveGhost(m: DuelMemory, g: GhostRecord): void {
  m.ghosts = [encodeGhost(g), ...m.ghosts].slice(0, GHOSTS_MAX);
}

export function listGhosts(m: DuelMemory): GhostRecord[] {
  return m.ghosts.map(decodeGhost).filter((g): g is GhostRecord => !!g);
}

export function currentRank(m: DuelMemory): FinRank {
  return m.rank.rank;
}
