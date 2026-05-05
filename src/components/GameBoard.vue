<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { useGame } from '@/composables/useGame';

const props = defineProps<{
  game: ReturnType<typeof useGame>;
}>();

const boardContainerRef = ref<HTMLElement | null>(null);
const gameGridRef = ref<HTMLElement | null>(null);

let longPressTimer: ReturnType<typeof setTimeout> | null = null;
let resizeDebounce: ReturnType<typeof setTimeout> | null = null;

function handleClick(event: MouseEvent): void {
  const cellEl = (event.target as HTMLElement).closest('[data-row]') as HTMLElement | null;
  if (!cellEl) return;
  const r = parseInt(cellEl.dataset.row!);
  const c = parseInt(cellEl.dataset.col!);
  props.game.handleCellClick(r, c);
}

function handleContextMenu(event: MouseEvent): void {
  event.preventDefault();
  const cellEl = (event.target as HTMLElement).closest('[data-row]') as HTMLElement | null;
  if (!cellEl) return;
  const r = parseInt(cellEl.dataset.row!);
  const c = parseInt(cellEl.dataset.col!);
  props.game.handleCellRightClick(r, c);
}

function handleDoubleClick(event: MouseEvent): void {
  const cellEl = (event.target as HTMLElement).closest('[data-row]') as HTMLElement | null;
  if (!cellEl) return;
  const r = parseInt(cellEl.dataset.row!);
  const c = parseInt(cellEl.dataset.col!);
  props.game.handleCellDoubleClick(r, c);
}

function handleTouchStart(event: TouchEvent): void {
  const cellEl = (event.target as HTMLElement).closest('[data-row]') as HTMLElement | null;
  if (!cellEl) return;
  const state = props.game.gameState.value;
  if (state === 'lost' || state === 'won') return;

  const r = parseInt(cellEl.dataset.row!);
  const c = parseInt(cellEl.dataset.col!);
  const engine = props.game.getEngine();
  if (!engine) return;

  const cellData = engine.getCellState(r, c);
  if (cellData.revealed) return;

  longPressTimer = setTimeout(() => {
    if (engine.getGameState() === 'playing' && !cellData.revealed) {
      props.game.handleCellRightClick(r, c);
      if (navigator.vibrate) {
        navigator.vibrate(15);
      }
    }
    longPressTimer = null;
  }, 500);
}

function handleTouchEnd(): void {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function handleTouchMove(): void {
  if (longPressTimer) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
  }
}

function handleKeydown(event: KeyboardEvent): void {
  if (event.key === 'f' || event.key === 'F') {
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      props.game.toggleFlagMode();
    }
  }
  if (event.key === 'r' || event.key === 'R') {
    if (!event.ctrlKey && !event.metaKey && !event.altKey) {
      props.game.resetGame();
    }
  }
}

function handleResize(): void {
  clearTimeout(resizeDebounce!);
  resizeDebounce = setTimeout(() => {
    const renderer = props.game.getRenderer();
    if (renderer) {
      renderer.calculateAndApplySize();
      renderer.updateAllCells();
    }
  }, 250);
}

onMounted(() => {
  if (gameGridRef.value) {
    props.game.initGame(gameGridRef.value);

    gameGridRef.value.addEventListener('click', handleClick);
    gameGridRef.value.addEventListener('contextmenu', handleContextMenu);
    gameGridRef.value.addEventListener('dblclick', handleDoubleClick);
    gameGridRef.value.addEventListener('touchstart', handleTouchStart, { passive: true });
    gameGridRef.value.addEventListener('touchend', handleTouchEnd);
    gameGridRef.value.addEventListener('touchmove', handleTouchMove);
  }

  document.addEventListener('keydown', handleKeydown);
  window.addEventListener('resize', handleResize);
});

onUnmounted(() => {
  if (gameGridRef.value) {
    gameGridRef.value.removeEventListener('click', handleClick);
    gameGridRef.value.removeEventListener('contextmenu', handleContextMenu);
    gameGridRef.value.removeEventListener('dblclick', handleDoubleClick);
    gameGridRef.value.removeEventListener('touchstart', handleTouchStart);
    gameGridRef.value.removeEventListener('touchend', handleTouchEnd);
    gameGridRef.value.removeEventListener('touchmove', handleTouchMove);
  }
  document.removeEventListener('keydown', handleKeydown);
  window.removeEventListener('resize', handleResize);

  const renderer = props.game.getRenderer();
  if (renderer) {
    renderer.destroy();
  }
});

</script>

<template>
  <div
    ref="boardContainerRef"
    class="scrollbar-thin overflow-auto max-w-full rounded-lg"
  >
    <div ref="gameGridRef" class="game-grid"></div>
  </div>
</template>
