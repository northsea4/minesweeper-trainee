<script setup lang="ts">
import type { GameState } from '@/game/types';

defineProps<{
  mineCount: number;
  timer: number;
  resetEmoji: string;
}>();

const emit = defineEmits<{
  reset: [];
}>();

function handleReset(event: MouseEvent): void {
  const btn = event.currentTarget as HTMLElement;
  btn.style.transform = 'scale(0.8) rotate(-20deg)';
  setTimeout(() => {
    btn.style.transform = 'scale(1.1) rotate(10deg)';
    setTimeout(() => {
      btn.style.transform = '';
    }, 150);
  }, 100);
  emit('reset');
}
</script>

<template>
  <div class="flex items-center gap-3 sm:gap-6 bg-slate-700/60 backdrop-blur-sm rounded-2xl px-4 sm:px-8 py-3 shadow-xl border border-slate-500/30">
    <!-- Mine counter -->
    <div class="flex items-center gap-2">
      <span class="text-xl sm:text-2xl">💣</span>
      <span class="text-2xl sm:text-3xl font-mono font-bold text-red-400 min-w-[40px] sm:min-w-[50px] text-center tabular-nums">
        {{ mineCount }}
      </span>
    </div>

    <!-- Reset button -->
    <button
      class="text-3xl sm:text-4xl w-12 h-12 sm:w-14 sm:h-14 rounded-full bg-gradient-to-b from-slate-500 to-slate-600 shadow-lg hover:shadow-xl hover:scale-110 active:scale-90 transition-all duration-200 border-2 border-slate-400 flex items-center justify-center select-none"
      title="重新开始"
      @click="handleReset"
    >
      {{ resetEmoji }}
    </button>

    <!-- Timer -->
    <div class="flex items-center gap-2">
      <span class="text-xl sm:text-2xl">⏱️</span>
      <span class="text-2xl sm:text-3xl font-mono font-bold text-cyan-400 min-w-[50px] sm:min-w-[60px] text-center tabular-nums">
        {{ timer }}
      </span>
    </div>
  </div>
</template>
