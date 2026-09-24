import type { Board, BoardConfig } from "./types.ts";

export function indexOf(x: number, y: number, width: number): number {
  return y * width + x;
}

export function coordsOf(index: number, width: number): { x: number; y: number } {
  return { x: index % width, y: Math.floor(index / width) };
}

export function neighborsOf(
  index: number,
  { width, height }: Pick<BoardConfig, "width" | "height">,
): number[] {
  const x = index % width;
  const y = Math.floor(index / width);
  const out: number[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      out.push(indexOf(nx, ny, width));
    }
  }
  return out;
}

export function emptyBoard(config: BoardConfig): Board {
  return {
    width: config.width,
    height: config.height,
    mines: config.mines,
    cells: Array.from({ length: config.width * config.height }, () => ({ mine: false, adjacent: 0 })),
  };
}

export interface CompactBoard {
  width: number;
  height: number;
  mines: number;
  mine: Uint8Array;
  adjacent: Uint8Array;
}

export function toCompact(board: Board): CompactBoard {
  const mine = new Uint8Array(board.cells.length);
  const adjacent = new Uint8Array(board.cells.length);
  for (let index = 0; index < board.cells.length; index++) {
    mine[index] = board.cells[index].mine ? 1 : 0;
    adjacent[index] = board.cells[index].adjacent;
  }
  return { width: board.width, height: board.height, mines: board.mines, mine, adjacent };
}

export function fromCompact(compact: CompactBoard): Board {
  return {
    width: compact.width,
    height: compact.height,
    mines: compact.mines,
    cells: Array.from({ length: compact.mine.length }, (_, index) => ({
      mine: compact.mine[index] === 1,
      adjacent: compact.adjacent[index],
    })),
  };
}
