import type { RevealMode } from "../app/settings.ts";
import type { GameState } from "../core/types.ts";

export interface BoardCallbacks {
  onReveal: (index: number) => void;
  onFlag: (index: number) => void;
  onChord: (index: number) => void;
}

export interface BoardOptions {
  getRevealMode: () => RevealMode;
  isLocked: () => boolean;
  showNumberDots?: () => boolean;
}

interface Aim {
  pointerId: number;
  index: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  touch: boolean;
  moved: boolean;
  consumed: boolean;
  timer: number | null;
}

interface PointerRecord {
  x: number;
  y: number;
  touch: boolean;
}

const LONG_PRESS_MS = 450;
const MOVE_THRESHOLD = 10;
const MIN_SCALE = 0.6;
const MAX_SCALE = 3;

export class BoardView {
  readonly el: HTMLDivElement;
  private cells: HTMLButtonElement[] = [];
  private marker: HTMLDivElement;
  private renderWidth = 0;
  private pointers = new Map<number, PointerRecord>();
  private aim: Aim | null = null;
  private pinch: { distance: number; scale: number; midX: number; midY: number; tx: number; ty: number } | null = null;
  private transform = { scale: 1, tx: 0, ty: 0 };

  constructor(
    private callbacks: BoardCallbacks,
    private options: BoardOptions,
  ) {
    this.el = document.createElement("div");
    this.el.className = "board";
    this.el.setAttribute("role", "group");
    this.marker = document.createElement("div");
    this.marker.className = "aim-marker";
    this.marker.setAttribute("aria-hidden", "true");
    this.el.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("pointercancel", this.onPointerUp);
  }

  mount(host: HTMLElement): void {
    host.replaceChildren(this.el);
  }

  destroy(): void {
    this.clearAim();
    this.el.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerup", this.onPointerUp);
    window.removeEventListener("pointercancel", this.onPointerUp);
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
    if (this.aim) this.markAim(this.aim.index, this.aim.touch);
  }

  private build(state: GameState): void {
    this.clearAim();
    this.el.replaceChildren();
    this.cells = [];
    this.renderWidth = state.config.width;
    for (let index = 0; index < state.config.width * state.config.height; index++) {
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "cell";
      cell.dataset.index = String(index);
      cell.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        if (this.options.isLocked()) return;
        this.clearAim();
        this.callbacks.onFlag(index);
      });
      cell.addEventListener("keydown", (event) => {
        if (this.options.isLocked()) return;
        if (event.key === "f" || event.key === "F") {
          event.preventDefault();
          this.callbacks.onFlag(index);
        } else if (event.key === "c" || event.key === "C") {
          event.preventDefault();
          this.callbacks.onChord(index);
        } else if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          this.callbacks.onReveal(index);
        } else if (ARROW_KEYS[event.key]) {
          const [dx, dy] = ARROW_KEYS[event.key];
          const nx = (index % state.config.width) + dx;
          const ny = Math.floor(index / state.config.width) + dy;
          if (nx < 0 || ny < 0 || nx >= state.config.width || ny >= state.config.height) return;
          event.preventDefault();
          this.cells[ny * state.config.width + nx]?.focus();
        }
      });
      this.cells.push(cell);
      this.el.appendChild(cell);
    }
    this.el.appendChild(this.marker);
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
      cell.classList.toggle(
        `cell--d${n}`,
        mark === "revealed" && adjacent === n && (this.options.showNumberDots?.() ?? true),
      );
    }
    const dots = this.options.showNumberDots?.() ?? true;
    cell.classList.toggle("cell--dots", mark === "revealed" && adjacent > 0 && dots);

    let text = "";
    if (mark === "flagged") text = "🚩";
    else if (showMine) text = "💣";
    else if (mark === "revealed" && adjacent > 0) text = String(adjacent);
    cell.textContent = text;

    cell.setAttribute("aria-label", `第 ${index + 1} 格，${describe(mark, showMine, adjacent)}`);
    cell.disabled = state.status === "won" || state.status === "lost";
  }

  private onPointerDown = (event: PointerEvent): void => {
    const cell = this.cellAt(event.target);
    if (this.options.isLocked()) return;

    if (event.pointerType === "mouse" && event.button === 2) {
      return;
    }

    const index = cell ? Number(cell.dataset.index) : null;
    this.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      touch: event.pointerType !== "mouse",
    });

    if (event.pointerType !== "mouse") {
      if (this.pointers.size >= 2) {
        this.clearAim();
        this.beginPinch();
        return;
      }
    }

    if (index === null) return;

    if (event.pointerType === "mouse" && event.button === 1) {
      event.preventDefault();
      this.callbacks.onChord(index);
      return;
    }

    if (this.options.getRevealMode() === "press" && this.isPrimaryButton(event)) {
      this.aim = {
        pointerId: event.pointerId,
        index,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        touch: event.pointerType !== "mouse",
        moved: false,
        consumed: true,
        timer: null,
      };
      this.callbacks.onReveal(index);
      return;
    }

    if (this.isPrimaryButton(event)) {
      this.startAim(event, index);
    }
  };

  private onPointerMove = (event: PointerEvent): void => {
    const record = this.pointers.get(event.pointerId);
    if (record) {
      record.x = event.clientX;
      record.y = event.clientY;
    }

    if (this.pinch && this.pointers.size >= 2) {
      this.updatePinch();
      return;
    }

    const aim = this.aim;
    if (!aim || aim.pointerId !== event.pointerId) return;
    const dx = event.clientX - aim.startX;
    const dy = event.clientY - aim.startY;
    if (!aim.moved && Math.hypot(dx, dy) > MOVE_THRESHOLD) {
      aim.moved = true;
      if (aim.timer !== null) {
        window.clearTimeout(aim.timer);
        aim.timer = null;
      }
      this.marker.classList.remove("aim-marker--on");
    }
    if (aim.moved && aim.touch) {
      this.transform.tx += event.clientX - aim.lastX;
      this.transform.ty += event.clientY - aim.lastY;
      this.applyTransform();
    }
    aim.lastX = event.clientX;
    aim.lastY = event.clientY;
  };

  private onPointerUp = (event: PointerEvent): void => {
    this.pointers.delete(event.pointerId);
    if (this.pinch && this.pointers.size < 2) {
      this.pinch = null;
    }
    const aim = this.aim;
    if (!aim || aim.pointerId !== event.pointerId) return;
    if (aim.timer !== null) window.clearTimeout(aim.timer);
    this.aim = null;
    this.marker.classList.remove("aim-marker--on");
    if (aim.consumed || aim.moved) return;
    const released = this.cellAt(document.elementFromPoint(event.clientX, event.clientY));
    const index = released ? Number(released.dataset.index) : null;
    if (index === aim.index) {
      this.callbacks.onReveal(index);
    }
  };

  private startAim(event: PointerEvent, index: number): void {
    this.clearAim();
    const touch = event.pointerType !== "mouse";
    const aim: Aim = {
      pointerId: event.pointerId,
      index,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      touch,
      moved: false,
      consumed: false,
      timer: null,
    };
    if (touch) {
      aim.timer = window.setTimeout(() => {
        if (this.aim === aim && !aim.moved) {
          aim.consumed = true;
          this.marker.classList.remove("aim-marker--on");
          this.callbacks.onFlag(index);
        }
      }, LONG_PRESS_MS);
    }
    this.aim = aim;
    this.markAim(index, touch);
  }

  private clearAim(): void {
    if (this.aim?.timer != null) window.clearTimeout(this.aim.timer);
    this.aim = null;
    this.marker.classList.remove("aim-marker--on");
  }

  private markAim(index: number, touch: boolean): void {
    const cell = this.cells[index];
    if (!cell || !this.el.isConnected) return;
    const width = cell.offsetWidth;
    const height = cell.offsetHeight;
    this.marker.style.width = `${width}px`;
    this.marker.style.height = `${height}px`;
    this.marker.style.left = `${cell.offsetLeft}px`;
    this.marker.style.top = `${cell.offsetTop - (touch ? height * 0.9 : 0)}px`;
    this.marker.classList.add("aim-marker--on");
  }

  private beginPinch(): void {
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    this.pinch = {
      distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      scale: this.transform.scale,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      tx: this.transform.tx,
      ty: this.transform.ty,
    };
  }

  private updatePinch(): void {
    const pinch = this.pinch;
    if (!pinch) return;
    const [a, b] = [...this.pointers.values()];
    if (!a || !b) return;
    const distance = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const scale = clamp(pinch.scale * (distance / pinch.distance), MIN_SCALE, MAX_SCALE);
    this.transform.scale = scale;
    this.transform.tx = pinch.tx + ((a.x + b.x) / 2 - pinch.midX);
    this.transform.ty = pinch.ty + ((a.y + b.y) / 2 - pinch.midY);
    this.applyTransform();
  }

  private applyTransform(): void {
    const { scale, tx, ty } = this.transform;
    this.el.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  private isPrimaryButton(event: PointerEvent): boolean {
    if (event.pointerType !== "mouse") return true;
    if (event.button === 0) {
      return (event.buttons & 3) === 1 || event.buttons === 0;
    }
    return false;
  }

  private cellAt(target: EventTarget | null): HTMLElement | null {
    return target instanceof Element ? target.closest<HTMLElement>(".cell") : null;
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const ARROW_KEYS: Record<string, [number, number]> = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
};

function describe(mark: string, showMine: boolean, adjacent: number): string {
  if (showMine) return "地雷";
  if (mark === "flagged") return "已标记";
  if (mark === "revealed") return adjacent === 0 ? "空" : `周围有 ${adjacent} 个雷`;
  return "未揭开";
}
