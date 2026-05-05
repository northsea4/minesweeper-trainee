import { ref } from 'vue';
import type { Difficulty, GameCallbacks, GameState, SoundAction } from '@/game/types';
import { Engine } from '@/game/Engine';
import { Renderer } from '@/game/Renderer';
import { AudioManager } from '@/game/AudioManager';
import { spawnConfetti, clearConfetti } from '@/game/confetti';
import { DIFFICULTIES, CUSTOM_DEFAULTS } from '@/game/constants';

export function useGame() {
  const difficulty = ref<Difficulty>('easy');
  const gameState = ref<GameState>('idle');
  const minesRemaining = ref(DIFFICULTIES.easy.mines);
  const timerValue = ref(0);
  const flagMode = ref(false);
  const soundEnabled = ref(true);
  const showConfetti = ref(false);
  const resetEmoji = ref('😊');

  const customRows = ref<number>(CUSTOM_DEFAULTS.rows);
  const customCols = ref<number>(CUSTOM_DEFAULTS.cols);
  const customMines = ref<number>(CUSTOM_DEFAULTS.mines);

  let engine: Engine | null = null;
  let renderer: Renderer | null = null;
  let confettiTimer: ReturnType<typeof setTimeout> | null = null;
  const audio = new AudioManager();

  function makeCallbacks(): GameCallbacks {
    return {
      onMineCountChange(remaining: number) {
        minesRemaining.value = remaining;
      },
      onTimerChange(seconds: number) {
        timerValue.value = seconds;
      },
      onGameStateChange(state: GameState, emoji: string) {
        gameState.value = state;
        resetEmoji.value = emoji;
      },
      onAction(action: SoundAction) {
        switch (action) {
          case 'reveal': audio.playReveal(); break;
          case 'flag': audio.playFlag(); break;
          case 'chord': audio.playChord(); break;
          case 'explode': audio.playExplosion(); break;
        }
      },
    };
  }

  function initGame(container: HTMLElement): void {
    engine = new Engine(difficulty.value, makeCallbacks());
    renderer = new Renderer(container, engine);
    renderer.calculateAndApplySize();
    renderer.renderBoard();
  }

  function resetGame(newDifficulty?: Difficulty): void {
    clearConfettiContainer();
    showConfetti.value = false;

    if (newDifficulty && newDifficulty !== difficulty.value) {
      difficulty.value = newDifficulty;
      if (newDifficulty === 'custom') {
        applyCustomToConfig();
      }
    }

    if (engine) {
      engine.reset(difficulty.value);
    } else {
      return;
    }

    renderer!.renderBoard();
    renderer!.calculateAndApplySize();
    renderer!.updateAllCells();
  }

  function applyCustomToConfig(): void {
    const rows = clamp(customRows.value, 5, 30);
    const cols = clamp(customCols.value, 5, 50);
    const maxMines = rows * cols - 9;
    const mines = clamp(customMines.value, 1, maxMines);

    customRows.value = rows;
    customCols.value = cols;
    customMines.value = mines;

    DIFFICULTIES.custom = {
      key: 'custom',
      rows,
      cols,
      mines,
      label: `自定义 ${rows}×${cols}`,
      emoji: '⚙️',
    };
  }

  function applyCustomDifficulty(rows: number, cols: number, mines: number): void {
    customRows.value = rows;
    customCols.value = cols;
    customMines.value = mines;
    applyCustomToConfig();

    if (difficulty.value === 'custom') {
      resetGame('custom');
    } else {
      difficulty.value = 'custom';
      resetGame('custom');
    }
  }

  function toggleFlagMode(): void {
    flagMode.value = !flagMode.value;
  }

  function toggleSound(): void {
    soundEnabled.value = !soundEnabled.value;
    audio.setEnabled(soundEnabled.value);
  }

  function triggerWin(): void {
    showConfetti.value = true;
    audio.playWin();
    // auto-clear after 3s
    confettiTimer = setTimeout(() => {
      showConfetti.value = false;
    }, 3000);
  }

  function clearConfettiContainer(): void {
    if (confettiTimer) {
      clearTimeout(confettiTimer);
      confettiTimer = null;
    }
  }

  function handleCellClick(row: number, col: number): void {
    if (!engine || !renderer) return;
    const prevState = engine.getGameState();
    engine.handleCellClick(row, col, flagMode.value);
    renderer.updateAllCells();
    const newState = engine.getGameState();
    if (prevState !== 'lost' && newState === 'lost') {
      renderer.shakeBoard();
    }
    if (prevState !== 'won' && newState === 'won') {
      triggerWin();
    }
  }

  function handleCellRightClick(row: number, col: number): void {
    if (!engine || !renderer) return;
    engine.handleCellRightClick(row, col);
    renderer.updateCell(row, col);
    // Check win after flag toggle
    const newState = engine.getGameState();
    if (newState === 'won') {
      renderer.updateAllCells();
      triggerWin();
    }
  }

  function handleCellDoubleClick(row: number, col: number): void {
    if (!engine || !renderer) return;
    const prevState = engine.getGameState();
    engine.handleCellDoubleClick(row, col);
    renderer.updateAllCells();
    const newState = engine.getGameState();
    if (prevState !== 'lost' && newState === 'lost') {
      renderer.shakeBoard();
    }
    if (prevState !== 'won' && newState === 'won') {
      triggerWin();
    }
  }

  function getRenderer(): Renderer | null {
    return renderer;
  }

  function getEngine(): Engine | null {
    return engine;
  }

  function clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, Math.round(value)));
  }

  return {
    difficulty,
    gameState,
    minesRemaining,
    timerValue,
    flagMode,
    soundEnabled,
    showConfetti,
    resetEmoji,
    customRows,
    customCols,
    customMines,
    initGame,
    resetGame,
    applyCustomDifficulty,
    toggleFlagMode,
    toggleSound,
    handleCellClick,
    handleCellRightClick,
    handleCellDoubleClick,
    getRenderer,
    getEngine,
  };
}
