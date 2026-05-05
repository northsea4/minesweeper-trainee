<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Difficulty } from '@/game/types';
import { DIFFICULTIES } from '@/game/constants';

const props = defineProps<{
  currentDifficulty: Difficulty;
  customRows: number;
  customCols: number;
  customMines: number;
}>();

const emit = defineEmits<{
  select: [difficulty: Difficulty];
  'update:customRows': [value: number];
  'update:customCols': [value: number];
  'update:customMines': [value: number];
  applyCustom: [];
}>();

const difficulties: readonly Difficulty[] = ['easy', 'medium', 'hard', 'custom'];

const localRows = ref(props.customRows);
const localCols = ref(props.customCols);
const localMines = ref(props.customMines);

watch(() => props.customRows, (v) => { localRows.value = v; });
watch(() => props.customCols, (v) => { localCols.value = v; });
watch(() => props.customMines, (v) => { localMines.value = v; });

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(v)));
}

function onRowsChange(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  localRows.value = clamp(v, 5, 30);
  emit('update:customRows', localRows.value);
  emit('applyCustom');
}

function onColsChange(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  localCols.value = clamp(v, 5, 50);
  emit('update:customCols', localCols.value);
  emit('applyCustom');
}

function onMinesChange(e: Event) {
  const v = Number((e.target as HTMLInputElement).value);
  const maxMines = Math.max(1, localRows.value * localCols.value - 9);
  localMines.value = clamp(v, 1, maxMines);
  emit('update:customMines', localMines.value);
  emit('applyCustom');
}
</script>

<template>
  <div class="flex flex-col items-center gap-3">
    <div class="flex flex-wrap gap-2 sm:gap-3 justify-center">
      <button
        v-for="diff in difficulties"
        :key="diff"
        :data-difficulty="diff"
        :class="[
          'px-4 sm:px-6 py-2 sm:py-2.5 rounded-full font-bold text-sm sm:text-base transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 border-2',
          currentDifficulty === diff ? 'difficulty-active' : '',
          diff === 'easy' ? 'bg-gradient-to-r from-emerald-400 to-green-500 text-white border-emerald-300' : '',
          diff === 'medium' ? 'bg-gradient-to-r from-amber-400 to-orange-500 text-white border-amber-300' : '',
          diff === 'hard' ? 'bg-gradient-to-r from-rose-400 to-red-600 text-white border-rose-300' : '',
          diff === 'custom' ? 'bg-gradient-to-r from-violet-400 to-purple-600 text-white border-violet-300' : '',
        ]"
        @click="emit('select', diff)"
      >
        {{ DIFFICULTIES[diff].emoji }} {{ DIFFICULTIES[diff].label }}
      </button>
    </div>

    <div
      v-if="currentDifficulty === 'custom'"
      class="flex flex-wrap items-center gap-2 sm:gap-3 bg-gray-100 rounded-xl px-4 py-3 text-sm"
    >
      <label class="flex items-center gap-1 text-gray-700 font-medium">
        行<input
          class="w-14 px-2 py-1 rounded-lg border border-gray-300 text-center font-mono focus:outline-none focus:ring-2 focus:ring-violet-400"
          type="number"
          :value="localRows"
          min="5"
          max="30"
          @change="onRowsChange"
        />
      </label>
      <span class="text-gray-400 font-bold">×</span>
      <label class="flex items-center gap-1 text-gray-700 font-medium">
        列<input
          class="w-14 px-2 py-1 rounded-lg border border-gray-300 text-center font-mono focus:outline-none focus:ring-2 focus:ring-violet-400"
          type="number"
          :value="localCols"
          min="5"
          max="50"
          @change="onColsChange"
        />
      </label>
      <label class="flex items-center gap-1 text-gray-700 font-medium">
        雷<input
          class="w-16 px-2 py-1 rounded-lg border border-gray-300 text-center font-mono focus:outline-none focus:ring-2 focus:ring-violet-400"
          type="number"
          :value="localMines"
          min="1"
          :max="Math.max(1, localRows * localCols - 9)"
          @change="onMinesChange"
        />
      </label>
    </div>
  </div>
</template>
