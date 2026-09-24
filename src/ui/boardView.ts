import type { GameState } from "../core/types.ts";

export interface BoardCallbacks {
  onReveal: (index: number) => void;
  onFlag: (index: number) => void;
  onChord: (index: number) => void;
}

export class BoardView {
  readonly el: HTMLDivElement;
  private cells: HTMLButtonElement[] = [];
  private renderWidth = 0;

  constructor(private callbacks: BoardCallbacks) {
    this.el = document.createElement("div");
    this.el.className = "board";
    this.el.setAttribute("role", "group");
  }

  render(state: GameState): void {
    const { width, height } = state.config;
    if (width !== this.renderWidth || this.cells.length !== width * height) {
      this.build(state);
    }
    this.el.style.setProperty("--board-cols", String(width));
    this.el.style.setProperty("--board-rows", String(height));
    this.el.setAttribute("aria-label", `扫雷棋盘 ${width} × ${height}`);
    for (let index = 0; index < this.cells.length; index++) {
      this.paint(this.cells[index], index, state);
    }
  }

  private build(state: GameState): void {
    this.el.replaceChildren();
    this.cells = [];
    this.renderWidth = state.config.width;
    for (let index = 0; index < state.config.width * state.config.height; index++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.index = String(index);
      cell.addEventListener("click", () => this.callbacks.onReveal(index));
      cell.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        this.callbacks.onFlag(index);
      });
      cell.addEventListener("mousedown", (event) => {
        if (event.button === 1) {
          event.preventDefault();
          this.callbacks.onChord(index);
        }
      });
      cell.addEventListener("keydown", (event) => {
        const key = event.key;
        if (key === "f" || key === "F") {
          event.preventDefault();
          this.callbacks.onFlag(index);
        } else if (key === "c" || key === "C") {
          event.preventDefault();
          this.callbacks.onChord(index);
        }
      });
      this.cells.push(cell);
      this.el.appendChild(cell);
    }
  }

  private paint(cell: HTMLButtonElement, index: number, state: GameState): void {
    const mark = state.marks[index];
    const boardCell = state.board?.cells[index];
    const adjacent = boardCell?.adjacent ?? 0;
    const showMine = state.status === "lost" && boardCell?.mine === true;

    cell.dataset.mark = mark;
    cell.dataset.adjacent = String(adjacent);
    cell.classList.toggle("cell--revealed", mark === "revealed");
    cell.classList.toggle("cell--flagged", mark === "flagged");
    cell.classList.toggle("cell--mine", showMine);
    cell.classList.toggle("cell--boom", state.reviewIndex === index);
    for (let n = 1; n <= 8; n++) {
      cell.classList.toggle(`cell--n${n}`, mark === "revealed" && adjacent === n);
    }

    let text = "";
    if (mark === "flagged") text = "🚩";
    else if (showMine) text = "💣";
    else if (mark === "revealed" && adjacent > 0) text = String(adjacent);
    cell.textContent = text;

    cell.setAttribute(
      "aria-label",
      `第 ${index + 1} 格，${describe(mark, showMine, adjacent)}`,
    );
    cell.disabled = state.status === "won" || state.status === "lost";
  }
}

function describe(mark: string, showMine: boolean, adjacent: number): string {
  if (showMine) return "地雷";
  if (mark === "flagged") return "已标记";
  if (mark === "revealed") return adjacent === 0 ? "空" : `周围有 ${adjacent} 个雷`;
  return "未揭开";
}
