import type { GameMode } from "./types.ts";

export type Autonomy = "guided" | "practising" | "independent";
export type AidLevel = "hint" | "smart" | "leader";

export const AID_LADDER: AidLevel[] = ["hint", "smart", "leader"];

export interface TrainingState {
  unaidedStreak: number;
  gamesWon: number;
  helpStep: number;
  blockedAid: boolean;
  showAid: AidLevel | null;
}

export const NUDGE_IDLE_MS = 8000;

export function initialTraining(gamesWon = 0): TrainingState {
  return { unaidedStreak: 0, gamesWon, helpStep: 0, blockedAid: false, showAid: null };
}

export function autonomy(state: TrainingState): Autonomy {
  if (state.unaidedStreak >= 8 || state.gamesWon >= 2) return "independent";
  if (state.unaidedStreak >= 3) return "practising";
  return "guided";
}

export function ladderCeiling(state: TrainingState): number {
  const ceilings: Record<Autonomy, number> = { guided: 2, practising: 1, independent: 0 };
  return ceilings[autonomy(state)];
}

export function canRequestHelp(state: TrainingState): boolean {
  return !state.blockedAid;
}

export function nextAidLevel(state: TrainingState): AidLevel {
  const index = Math.min(state.helpStep, ladderCeiling(state));
  return AID_LADDER[index];
}

export function requestHelp(state: TrainingState): TrainingState {
  if (state.blockedAid) return state;
  return {
    ...state,
    showAid: nextAidLevel(state),
    helpStep: state.helpStep + 1,
    blockedAid: true,
    unaidedStreak: 0,
  };
}

export function independentAction(state: TrainingState): TrainingState {
  return {
    ...state,
    unaidedStreak: state.unaidedStreak + 1,
    blockedAid: false,
    showAid: null,
  };
}

export function mistake(state: TrainingState): TrainingState {
  return { ...state, unaidedStreak: 0, blockedAid: false, showAid: null };
}

export function onGameWon(state: TrainingState): TrainingState {
  return { ...state, gamesWon: state.gamesWon + 1 };
}

export function setGamesWon(state: TrainingState, gamesWon: number): TrainingState {
  return { ...state, gamesWon };
}

export function shouldNudge(
  state: TrainingState,
  options: { mode: GameMode; nudgeEnabled: boolean; idleMs: number; threshold?: number },
): boolean {
  if (options.mode !== "training") return false;
  if (!options.nudgeEnabled) return false;
  if (autonomy(state) === "independent") return false;
  if (state.showAid !== null) return false;
  const threshold = options.threshold ?? NUDGE_IDLE_MS;
  return options.idleMs >= threshold;
}
