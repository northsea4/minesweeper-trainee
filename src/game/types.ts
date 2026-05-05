export type Difficulty = 'easy' | 'medium' | 'hard' | 'custom';

export interface DifficultyConfig {
  readonly key: Difficulty;
  readonly rows: number;
  readonly cols: number;
  readonly mines: number;
  readonly label: string;
  readonly emoji: string;
}

export type GameState = 'idle' | 'playing' | 'won' | 'lost';

export interface CellData {
  mine: boolean;
  revealed: boolean;
  flagged: boolean;
  adjacentMines: number;
  exploded: boolean;
}

export type CellGrid = CellData[][];

export type SoundAction = 'reveal' | 'flag' | 'chord' | 'explode';

export interface GameCallbacks {
  onMineCountChange: (remaining: number) => void;
  onTimerChange: (seconds: number) => void;
  onGameStateChange: (state: GameState, emoji: string) => void;
  onAction?: (action: SoundAction) => void;
}
