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
