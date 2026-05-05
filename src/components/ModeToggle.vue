<script setup lang="ts">
defineProps<{
  flagMode: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <div class="flex items-center gap-3">
    <span class="text-xs sm:text-sm text-slate-400 select-none">模式：</span>
    <button
      :class="[
        'px-4 py-2 rounded-full font-bold text-sm transition-all duration-200 shadow-lg border-2 hover:shadow-xl hover:scale-105 active:scale-95 flex items-center gap-2 select-none',
        flagMode
          ? 'mode-active-flag from-amber-400 to-orange-500 border-amber-400 bg-gradient-to-r text-white'
          : 'from-sky-500 to-blue-600 border-sky-400 bg-gradient-to-r text-white',
      ]"
      title="切换挖掘/标记模式（或使用右键标记）"
      @click="emit('toggle')"
    >
      <span>{{ flagMode ? '🚩' : '⛏️' }}</span>
      <span>{{ flagMode ? '标记' : '挖掘' }}</span>
    </button>
  </div>
</template>
