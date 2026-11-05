<script setup lang="ts">
// Full-window loading screen for work the user must wait on. Driven by
// withLoading()/beginLoading() in lib/loading.ts; mounted once in App.vue.
import { computed } from "vue";
import Spinner from "./Spinner.vue";
import { useLoadingOverlay } from "@/lib/loading";

const task = useLoadingOverlay();
const percent = computed(() => {
  const progress = task.value?.progress;
  return typeof progress === "number" ? Math.round(Math.min(1, Math.max(0, progress)) * 100) : null;
});
</script>

<template>
  <Teleport to="body">
    <Transition name="loading-overlay">
      <div
        v-if="task"
        class="loading-overlay"
        data-testid="loading-overlay"
        aria-live="polite"
        aria-busy="true"
      >
        <div class="loading-card" role="status">
          <Spinner :size="32" />
          <div class="loading-copy">
            <p class="loading-title" data-testid="loading-overlay-label">{{ task.label }}</p>
            <p v-if="task.detail" class="loading-detail">{{ task.detail }}</p>
          </div>
          <div
            v-if="percent !== null"
            class="loading-progress"
            role="progressbar"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="percent"
          >
            <div class="loading-progress-bar" :style="{ width: `${percent}%` }" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.loading-overlay {
  position: fixed;
  inset: 0;
  z-index: 20000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: color-mix(in srgb, var(--color-ground) 70%, transparent);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  cursor: progress;
}

.loading-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  width: 320px;
  max-width: 100%;
  padding: 28px 24px 24px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-mdl);
  color: var(--color-accent);
  text-align: center;
}

.loading-copy {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.loading-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text);
}

.loading-detail {
  font-size: 12px;
  line-height: 1.5;
  color: var(--color-text-muted);
}

.loading-progress {
  width: 100%;
  height: 4px;
  border-radius: 2px;
  background: var(--color-bg-tertiary);
  overflow: hidden;
}

.loading-progress-bar {
  height: 100%;
  border-radius: 2px;
  background: var(--color-accent);
  transition: width 0.15s linear;
}

.loading-overlay-enter-active,
.loading-overlay-leave-active {
  transition: opacity 0.18s ease;
}

.loading-overlay-enter-from,
.loading-overlay-leave-to {
  opacity: 0;
}
</style>
