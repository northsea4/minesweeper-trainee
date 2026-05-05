import type { Difficulty, DifficultyConfig } from './types';

export const CUSTOM_DEFAULTS = { rows: 9, cols: 9, mines: 10 } as const;

export const DIFFICULTIES: Record<Difficulty, DifficultyConfig> = {
  easy:   { key: 'easy',   rows: 9,  cols: 9,  mines: 10, label: '初级 9×9',   emoji: '😊' },
  medium: { key: 'medium', rows: 16, cols: 16, mines: 40, label: '中级 16×16', emoji: '😐' },
  hard:   { key: 'hard',   rows: 16, cols: 30, mines: 99, label: '高级 30×16', emoji: '😈' },
  custom: { key: 'custom', rows: CUSTOM_DEFAULTS.rows, cols: CUSTOM_DEFAULTS.cols, mines: CUSTOM_DEFAULTS.mines, label: '自定义', emoji: '⚙️' },
};

export const NUMBER_COLORS: Record<number, string> = {
  1: '#2563eb',
  2: '#16a34a',
  3: '#dc2626',
  4: '#1e3a8a',
  5: '#7f1d1d',
  6: '#0d9488',
  7: '#1f2937',
  8: '#6b7280',
};

export const CELL_SIZE_MIN = 22;
export const CELL_SIZE_MAX = 48;
export const TIMER_MAX = 999;

export const ADJACENT_OFFSETS: ReadonlyArray<[number, number]> = [
  [-1, -1], [-1, 0], [-1, 1],
  [0, -1],           [0, 1],
  [1, -1],  [1, 0],  [1, 1],
];
