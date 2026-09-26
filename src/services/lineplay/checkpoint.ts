import AsyncStorage from '@react-native-async-storage/async-storage';
import type { ActivityItem, SessionRewards, WaitSource } from './LinePlaySession';
import type { PredictionCard } from './content';
import type { CurrentQuestProof } from '../../api/endpoints/me/inline-timer/currentQuest';
import { isCrewRelayProgress, type CrewRelayProgress } from './crewRelay';

const PREFIX = 'lineplay_checkpoint_v1_';
const MAX_AGE_MS = 3 * 60 * 60 * 1000;

export interface LinePlayCheckpoint {
  version: 1;
  playerId: number;
  rideId: number;
  startRequestId: string;
  serverSessionId: string | null;
  startedAt: number;
  endedAt: number | null;
  plannedWaitMinutes: number;
  waitSource?: WaitSource;
  extraRoundsAdded?: number;
  playlist: ActivityItem[];
  completedActivityIds: string[];
  loreChoices?: Record<string, number>;
  crewGridMarks?: number[];
  prediction: { card: PredictionCard; guess: 'beat' | 'miss' } | null;
  boardingConfirmed?: boolean;
  boardingAt?: number | null;
  crewRelay?: CrewRelayProgress | null;
  state: 'active' | 'complete';
  verifiedEligibleSeconds: number;
  rewards: SessionRewards | null;
  rewardsPending: boolean;
  currentQuestProof?: CurrentQuestProof | null;
}

export function checkpointKey(playerId: number, rideId: number): string {
  return `${PREFIX}${playerId}_${rideId}`;
}

export function parseCheckpoint(raw: string | null, playerId: number, rideId: number,
  nowMs = Date.now()): LinePlayCheckpoint | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as LinePlayCheckpoint;
    if (value?.version !== 1 || value.playerId !== playerId || value.rideId !== rideId ||
      typeof value.startRequestId !== 'string' || value.startRequestId.length < 16 ||
      !Number.isFinite(value.startedAt) || value.startedAt > nowMs + 60_000 ||
      nowMs - value.startedAt > MAX_AGE_MS ||
      !Number.isFinite(value.plannedWaitMinutes) || value.plannedWaitMinutes <= 0 ||
      (value.waitSource !== undefined && !['posted', 'last_known', 'estimate'].includes(value.waitSource)) ||
      (value.extraRoundsAdded !== undefined && (!Number.isInteger(value.extraRoundsAdded) ||
        value.extraRoundsAdded < 0 || value.extraRoundsAdded > 80)) ||
      !Array.isArray(value.playlist) || value.playlist.length > 80 ||
      !value.playlist.every(item => typeof item?.id === 'string' && typeof item?.kind === 'string') ||
      !Array.isArray(value.completedActivityIds) || value.completedActivityIds.length > 90 ||
      !value.completedActivityIds.every(id => typeof id === 'string') ||
      (value.loreChoices !== undefined && (
        typeof value.loreChoices !== 'object' || value.loreChoices === null ||
        Array.isArray(value.loreChoices) || Object.keys(value.loreChoices).length > 80 ||
        !Object.entries(value.loreChoices).every(([id, choice]) =>
          id.length > 0 && id.length <= 100 && Number.isInteger(choice) && choice >= 0 && choice <= 2))) ||
      (value.crewGridMarks !== undefined && (
        !Array.isArray(value.crewGridMarks) || value.crewGridMarks.length > 9 ||
        new Set(value.crewGridMarks).size !== value.crewGridMarks.length ||
        !value.crewGridMarks.every(index => Number.isInteger(index) && index >= 0 && index <= 8))) ||
      (value.boardingConfirmed !== undefined && typeof value.boardingConfirmed !== 'boolean') ||
      (value.boardingAt !== undefined && value.boardingAt !== null &&
        (!Number.isFinite(value.boardingAt) || value.boardingAt < value.startedAt || value.boardingAt > nowMs + 60_000)) ||
      (value.crewRelay !== undefined && value.crewRelay !== null && !isCrewRelayProgress(value.crewRelay)) ||
      (value.currentQuestProof !== undefined && value.currentQuestProof !== null && (
        !Number.isInteger(value.currentQuestProof.seed) || value.currentQuestProof.seed < 0 ||
        value.currentQuestProof.seed > 0xffffffff ||
        !Number.isInteger(value.currentQuestProof.score) || value.currentQuestProof.score < 300 ||
        !Number.isInteger(value.currentQuestProof.duration_seconds) ||
        value.currentQuestProof.duration_seconds < 1 || value.currentQuestProof.duration_seconds > 3600 ||
        !Array.isArray(value.currentQuestProof.paths) || value.currentQuestProof.paths.length !== 3 ||
        !value.currentQuestProof.paths.every(path => Array.isArray(path) && path.length >= 7 &&
          path.length <= 100 && path.every(index => Number.isInteger(index) && index >= 0 && index <= 24)))) ||
      !['active', 'complete'].includes(value.state) ||
      (value.serverSessionId !== null && typeof value.serverSessionId !== 'string') ||
      !Number.isFinite(value.verifiedEligibleSeconds) || value.verifiedEligibleSeconds < 0 ||
      (value.rewards !== null && (typeof value.rewards !== 'object' || !Array.isArray(value.rewards.rideParts))) ||
      typeof value.rewardsPending !== 'boolean') return null;
    return value;
  } catch {
    return null;
  }
}

export async function readCheckpoint(playerId: number, rideId: number): Promise<LinePlayCheckpoint | null> {
  try {
    return parseCheckpoint(await AsyncStorage.getItem(checkpointKey(playerId, rideId)), playerId, rideId);
  } catch {
    return null;
  }
}

export async function writeCheckpoint(checkpoint: LinePlayCheckpoint): Promise<void> {
  await AsyncStorage.setItem(checkpointKey(checkpoint.playerId, checkpoint.rideId), JSON.stringify(checkpoint));
}

export async function removeCheckpoint(playerId: number, rideId: number): Promise<void> {
  await AsyncStorage.removeItem(checkpointKey(playerId, rideId));
}
