import type { CellData, GameState } from './types';
import type { Engine } from './Engine';
import { CELL_SIZE_MAX, CELL_SIZE_MIN, NUMBER_COLORS } from './constants';

export class Renderer {
  private container: HTMLElement;
  private engine: Engine;
  private cellSize = 40;

  constructor(container: HTMLElement, engine: Engine) {
    this.container = container;
    this.engine = engine;
  }

  renderBoard(): void {
    this.container.innerHTML = '';
    const { rows, cols } = this.engine.getDimensions();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cellEl = document.createElement('div');
        cellEl.className = 'cell cell-covered';
        cellEl.dataset.row = String(r);
        cellEl.dataset.col = String(c);
        this.container.appendChild(cellEl);
      }
    }
    this.updateGridStyle();
  }

  updateCell(r: number, c: number): void {
    const cellEl = this.getCellElement(r, c);
    if (!cellEl) return;

    const cellData = this.engine.getCellState(r, c);
    const gameState = this.engine.getGameState();

    cellEl.classList.remove('cell-covered', 'cell-revealed', 'cell-exploded', 'cell-flagged');
    cellEl.innerHTML = '';
    cellEl.style.fontSize = '';
    cellEl.style.opacity = '';

    if (cellData.revealed) {
      if (cellData.mine) {
        cellEl.classList.add('cell-revealed');
        if (cellData.exploded) {
          cellEl.classList.add('cell-exploded');
        }
        cellEl.innerHTML = '💣';
        cellEl.style.fontSize = this.cellSize * 0.55 + 'px';
      } else if (cellData.adjacentMines > 0) {
        cellEl.classList.add('cell-revealed');
        const num = cellData.adjacentMines;
        cellEl.innerHTML = String(num);
        cellEl.classList.add('mine-num-' + num);
        cellEl.style.fontSize = this.cellSize * 0.5 + 'px';
      } else {
        cellEl.classList.add('cell-revealed');
      }
    } else if (cellData.flagged) {
      cellEl.classList.add('cell-flagged');
      cellEl.innerHTML = '🚩';
      cellEl.style.fontSize = this.cellSize * 0.55 + 'px';
    } else {
      cellEl.classList.add('cell-covered');
    }

    // Game over: show unrevealed unflagged mines
    if (gameState === 'lost' && !cellData.revealed && cellData.mine && !cellData.flagged) {
      cellEl.classList.remove('cell-covered', 'cell-flagged');
      cellEl.classList.add('cell-revealed');
      cellEl.innerHTML = '💣';
      cellEl.style.fontSize = this.cellSize * 0.5 + 'px';
      cellEl.style.opacity = '0.7';
    }

    // Game over: mark wrongly flagged cells
    if (gameState === 'lost' && cellData.flagged && !cellData.mine) {
      cellEl.classList.remove('cell-flagged');
      cellEl.classList.add('cell-revealed');
      cellEl.innerHTML = '❌';
      cellEl.style.fontSize = this.cellSize * 0.5 + 'px';
      cellEl.style.opacity = '0.8';
    }

    // Win: auto-flag all mines
    if (gameState === 'won' && cellData.mine && !cellData.flagged) {
      cellEl.classList.remove('cell-covered');
      cellEl.classList.add('cell-flagged');
      cellEl.innerHTML = '🚩';
      cellEl.style.fontSize = this.cellSize * 0.55 + 'px';
      cellEl.style.opacity = '0.9';
    }
  }

  updateAllCells(): void {
    const { rows, cols } = this.engine.getDimensions();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        this.updateCell(r, c);
      }
    }
  }

  getCellElement(r: number, c: number): HTMLElement | null {
    return this.container.querySelector(`[data-row="${r}"][data-col="${c}"]`);
  }

  calculateAndApplySize(): void {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { rows, cols } = this.engine.getDimensions();
    const maxWidth = Math.min(vw - 32, 960);
    const maxHeight = vh - 380;

    const sizeByWidth = Math.floor(maxWidth / cols);
    const sizeByHeight = Math.floor(maxHeight / rows);

    let ideal = Math.min(sizeByWidth, sizeByHeight);
    ideal = Math.max(CELL_SIZE_MIN, Math.min(CELL_SIZE_MAX, ideal));
    if (vw < 640) {
      ideal = Math.max(CELL_SIZE_MIN, ideal - 2);
    }

    this.cellSize = ideal;
    document.documentElement.style.setProperty('--cell-size', ideal + 'px');
    document.documentElement.style.setProperty('--cell-gap', ideal <= 26 ? '0.5px' : '1px');

    this.updateGridStyle();
  }

  shakeBoard(): void {
    this.container.style.animation = 'shake 0.5s ease-in-out';
    setTimeout(() => {
      this.container.style.animation = '';
    }, 500);
  }

  destroy(): void {
    this.container.innerHTML = '';
  }

  private updateGridStyle(): void {
    const { rows, cols } = this.engine.getDimensions();
    this.container.style.gridTemplateColumns = `repeat(${cols}, var(--cell-size))`;
    this.container.style.gridTemplateRows = `repeat(${rows}, var(--cell-size))`;
  }
}
