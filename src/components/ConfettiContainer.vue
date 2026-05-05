<script setup lang="ts">
import { watch, ref } from 'vue';
import { spawnConfetti, clearConfetti } from '@/game/confetti';

const props = defineProps<{
  active: boolean;
}>();

const containerRef = ref<HTMLElement | null>(null);

watch(
  () => props.active,
  (val) => {
    if (!containerRef.value) return;
    if (val) {
      spawnConfetti(containerRef.value);
    } else {
      clearConfetti(containerRef.value);
    }
  },
);
</script>

<template>
  <div ref="containerRef" class="confetti-container"></div>
</template>
