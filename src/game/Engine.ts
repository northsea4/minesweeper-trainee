import type { CellData, CellGrid, Difficulty, DifficultyConfig, GameCallbacks, GameState } from './types';
import { ADJACENT_OFFSETS, DIFFICULTIES, TIMER_MAX } from './constants';

export class Engine {
  private board: CellGrid = [];
  private config: DifficultyConfig;
  private gameState: GameState = 'idle';
  private minesRemaining: number;
  private timerValue = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;
  private firstClickDone = false;
  private minesPlaced = false;
  private totalSafeCells = 0;
  private revealedCount = 0;
  private callbacks: GameCallbacks;

  constructor(difficulty: Difficulty, callbacks: GameCallbacks) {
    this.config = DIFFICULTIES[difficulty];
    this.minesRemaining = this.config.mines;
    this.callbacks = callbacks;
    this.initBoard();
  }

  // ─── Public API ───

  reset(newDifficulty?: Difficulty): void {
    this.stopTimer();
    this.timerValue = 0;
    this.gameState = 'idle';
    this.firstClickDone = false;
    this.minesPlaced = false;
    this.revealedCount = 0;

    if (newDifficulty) {
      this.config = DIFFICULTIES[newDifficulty];
    }
    this.minesRemaining = this.config.mines;
    this.totalSafeCells = this.config.rows * this.config.cols - this.config.mines;
    this.initBoard();

    this.callbacks.onMineCountChange(this.minesRemaining);
    this.callbacks.onTimerChange(0);
    this.callbacks.onGameStateChange('idle', this.config.emoji);
  }

  handleCellClick(row: number, col: number, flagMode: boolean): void {
    if (this.gameState === 'lost' || this.gameState === 'won') return;

    if (!this.firstClickDone) {
      this.firstClickDone = true;
      if (!this.minesPlaced) {
        this.placeMines(row, col);
      }
      this.gameState = 'playing';
      this.startTimer();
      this.revealCell(row, col);
      return;
    }

    if (!this.minesPlaced) {
      this.placeMines(row, col);
      this.gameState = 'playing';
      this.startTimer();
    }

    if (this.gameState !== 'playing') return;

    const cell = this.board[row][col];

    if (flagMode) {
      if (!cell.revealed) {
        this.toggleFlag(row, col);
      } else if (cell.adjacentMines > 0) {
        this.chordReveal(row, col);
      }
    } else {
      if (cell.flagged) return;
      if (cell.revealed && cell.adjacentMines > 0) {
        this.chordReveal(row, col);
      } else if (!cell.revealed) {
        this.revealCell(row, col);
      }
    }
  }

  handleCellRightClick(row: number, col: number): void {
    if (this.gameState === 'lost' || this.gameState === 'won') return;

    if (!this.firstClickDone) {
      this.toggleFlag(row, col);
      return;
    }

    if (this.gameState !== 'playing') return;
    this.toggleFlag(row, col);
  }

  handleCellDoubleClick(row: number, col: number): void {
    if (this.gameState !== 'playing') return;
    const cell = this.board[row][col];
    if (cell.revealed && cell.adjacentMines > 0) {
      this.chordReveal(row, col);
    }
  }

  getCellState(row: number, col: number): CellData {
    return this.board[row][col];
  }

  getGameState(): GameState {
    return this.gameState;
  }

  getMinesRemaining(): number {
    return this.minesRemaining;
  }

  getTimerValue(): number {
    return this.timerValue;
  }

  getDimensions(): { rows: number; cols: number } {
    return { rows: this.config.rows, cols: this.config.cols };
  }

  getConfig(): DifficultyConfig {
    return this.config;
  }

  getBoard(): Readonly<CellGrid> {
    return this.board;
  }

  // ─── Private: Board initialization ───

  private initBoard(): void {
    const { rows, cols } = this.config;
    this.board = [];
    for (let r = 0; r < rows; r++) {
      this.board[r] = [];
      for (let c = 0; c < cols; c++) {
        this.board[r][c] = {
          mine: false,
          revealed: false,
          flagged: false,
          adjacentMines: 0,
          exploded: false,
        };
      }
    }
  }

  // ─── Private: Mine placement ───

  private placeMines(safeRow: number, safeCol: number): void {
    const { rows, cols, mines } = this.config;

    // Build safe zone (3x3 around first click)
    const safeZone = new Set<number>();
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const nr = safeRow + dr;
        const nc = safeCol + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          safeZone.add(nr * cols + nc);
        }
      }
    }

    // Collect available positions outside safe zone
    const available: Array<{ r: number; c: number }> = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!safeZone.has(r * cols + c)) {
          available.push({ r, c });
        }
      }
    }

    const minesToPlace = Math.min(mines, available.length);

    // Fisher-Yates shuffle
    for (let i = available.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [available[i], available[j]] = [available[j], available[i]];
    }

    for (let i = 0; i < minesToPlace; i++) {
      const { r, c } = available[i];
      this.board[r][c].mine = true;
    }

    // Adjust counts if fewer mines were placed
    this.minesRemaining = minesToPlace;
    this.totalSafeCells = rows * cols - minesToPlace;
    this.callbacks.onMineCountChange(this.minesRemaining);

    // Calculate adjacent mine counts
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (!this.board[r][c].mine) {
          this.board[r][c].adjacentMines = this.countAdjacentMines(r, c);
        }
      }
    }

    this.minesPlaced = true;
  }

  private countAdjacentMines(r: number, c: number): number {
    let count = 0;
    for (const [dr, dc] of ADJACENT_OFFSETS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < this.config.rows && nc >= 0 && nc < this.config.cols && this.board[nr][nc].mine) {
        count++;
      }
    }
    return count;
  }

  // ─── Private: Reveal ───

  private revealCell(r: number, c: number, playSound = true): void {
    if (r < 0 || r >= this.config.rows || c < 0 || c >= this.config.cols) return;
    const cell = this.board[r][c];
    if (cell.revealed || cell.flagged) return;
    if (this.gameState === 'lost' || this.gameState === 'won') return;

    if (cell.mine) {
      cell.revealed = true;
      cell.exploded = true;
      this.gameState = 'lost';
      this.revealAllMines();
      this.stopTimer();
      this.callbacks.onGameStateChange('lost', '😵');
      this.callbacks.onAction?.('explode');
      return;
    }

    cell.revealed = true;
    this.revealedCount++;
    if (playSound) {
      this.callbacks.onAction?.('reveal');
    }

    if (cell.adjacentMines === 0) {
      for (const [dr, dc] of ADJACENT_OFFSETS) {
        this.revealCell(r + dr, c + dc, false);
      }
    }

    this.checkWin();
  }

  private simpleReveal(r: number, c: number): void {
    if (r < 0 || r >= this.config.rows || c < 0 || c >= this.config.cols) return;
    const cell = this.board[r][c];
    if (cell.revealed || cell.flagged || cell.mine) return;

    cell.revealed = true;
    this.revealedCount++;

    if (cell.adjacentMines === 0) {
      for (const [dr, dc] of ADJACENT_OFFSETS) {
        this.simpleReveal(r + dr, c + dc);
      }
    }
  }

  private chordReveal(r: number, c: number): void {
    const cell = this.board[r][c];
    if (!cell.revealed || cell.adjacentMines === 0) return;
    if (this.gameState !== 'playing') return;

    let flagCount = 0;
    for (const [dr, dc] of ADJACENT_OFFSETS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < this.config.rows && nc >= 0 && nc < this.config.cols && this.board[nr][nc].flagged) {
        flagCount++;
      }
    }

    if (flagCount !== cell.adjacentMines) return;

    let hitMine = false;
    for (const [dr, dc] of ADJACENT_OFFSETS) {
      const nr = r + dr;
      const nc = c + dc;
      if (nr >= 0 && nr < this.config.rows && nc >= 0 && nc < this.config.cols) {
        const neighbor = this.board[nr][nc];
        if (!neighbor.revealed && !neighbor.flagged) {
          if (neighbor.mine) {
            hitMine = true;
            neighbor.revealed = true;
            neighbor.exploded = true;
          } else {
            this.simpleReveal(nr, nc);
          }
        }
      }
    }

    if (hitMine) {
      this.gameState = 'lost';
      this.revealAllMines();
      this.stopTimer();
      this.callbacks.onGameStateChange('lost', '😵');
      this.callbacks.onAction?.('explode');
    } else {
      this.callbacks.onAction?.('chord');
      this.checkWin();
    }
  }

  private revealAllMines(): void {
    for (let r = 0; r < this.config.rows; r++) {
      for (let c = 0; c < this.config.cols; c++) {
        const cell = this.board[r][c];
        if (cell.mine && !cell.revealed && !cell.flagged) {
          cell.revealed = true;
        }
      }
    }
  }

  // ─── Private: Flag ───

  private toggleFlag(r: number, c: number): void {
    const cell = this.board[r][c];
    if (cell.revealed) return;

    if (cell.flagged) {
      cell.flagged = false;
      this.minesRemaining++;
    } else {
      cell.flagged = true;
      this.minesRemaining--;
    }

    this.callbacks.onMineCountChange(this.minesRemaining);
    this.callbacks.onAction?.('flag');
    this.checkWin();
  }

  // ─── Private: Win check ───

  private checkWin(): void {
    if (this.gameState === 'lost' || this.gameState === 'won') return;

    if (this.revealedCount >= this.totalSafeCells) {
      this.gameState = 'won';
      // Auto-flag all unflagged mines
      for (let r = 0; r < this.config.rows; r++) {
        for (let c = 0; c < this.config.cols; c++) {
          if (this.board[r][c].mine && !this.board[r][c].flagged) {
            this.board[r][c].flagged = true;
          }
        }
      }
      this.minesRemaining = 0;
      this.callbacks.onMineCountChange(0);
      this.stopTimer();
      this.callbacks.onGameStateChange('won', '😎');
    }
  }

  // ─── Private: Timer ───

  private startTimer(): void {
    if (this.timerInterval) return;
    this.timerValue = 0;
    this.callbacks.onTimerChange(0);
    this.timerInterval = setInterval(() => {
      this.timerValue = Math.min(this.timerValue + 1, TIMER_MAX);
      this.callbacks.onTimerChange(this.timerValue);
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
