<script setup lang="ts">
import { useGame } from '@/composables/useGame';
import AppHeader from '@/components/AppHeader.vue';
import DifficultySelector from '@/components/DifficultySelector.vue';
import InfoBar from '@/components/InfoBar.vue';
import ModeToggle from '@/components/ModeToggle.vue';
import SoundToggle from '@/components/SoundToggle.vue';
import GameBoard from '@/components/GameBoard.vue';
import HintText from '@/components/HintText.vue';
import ConfettiContainer from '@/components/ConfettiContainer.vue';

const game = useGame();
</script>

<template>
  <div class="flex flex-col items-center py-4 px-2 sm:py-8 sm:px-4 min-h-screen">
    <div class="w-full max-w-[960px] flex flex-col items-center gap-3 sm:gap-5">
      <AppHeader />

      <DifficultySelector
        :current-difficulty="game.difficulty.value"
        :custom-rows="game.customRows.value"
        :custom-cols="game.customCols.value"
        :custom-mines="game.customMines.value"
        @select="game.resetGame($event)"
        @update:custom-rows="game.customRows.value = $event"
        @update:custom-cols="game.customCols.value = $event"
        @update:custom-mines="game.customMines.value = $event"
        @apply-custom="game.applyCustomDifficulty(
          game.customRows.value,
          game.customCols.value,
          game.customMines.value
        )"
      />

      <InfoBar
        :mine-count="game.minesRemaining.value"
        :timer="game.timerValue.value"
        :reset-emoji="game.resetEmoji.value"
        @reset="game.resetGame()"
      />

      <div class="flex items-center gap-4">
        <ModeToggle
          :flag-mode="game.flagMode.value"
          @toggle="game.toggleFlagMode()"
        />
        <SoundToggle
          :sound-enabled="game.soundEnabled.value"
          @toggle="game.toggleSound()"
        />
      </div>

      <GameBoard :game="game" />

      <HintText />
    </div>

    <ConfettiContainer :active="game.showConfetti.value" />
  </div>
</template>
