<script setup lang="ts">
defineProps<{
  soundEnabled: boolean;
}>();

const emit = defineEmits<{
  toggle: [];
}>();
</script>

<template>
  <div class="flex items-center gap-3">
    <span class="text-xs sm:text-sm text-slate-400 select-none">音效：</span>
    <button
      :class="[
        'px-4 py-2 rounded-full font-bold text-sm transition-all duration-200 shadow-lg border-2 hover:shadow-xl hover:scale-105 active:scale-95 flex items-center gap-2 select-none',
        soundEnabled
          ? 'from-emerald-400 to-green-600 border-emerald-400 bg-gradient-to-r text-white'
          : 'from-slate-500 to-slate-700 border-slate-500 bg-gradient-to-r text-slate-300',
      ]"
      title="开关音效"
      @click="emit('toggle')"
    >
      <span>{{ soundEnabled ? '🔊' : '🔇' }}</span>
      <span>{{ soundEnabled ? '开启' : '静音' }}</span>
    </button>
  </div>
</template>
