<script setup lang="ts">
// A loading placeholder: spinner plus label. Centred in its container by
// default (empty list, reader, dialog body); `inline` lays it out as a
// single row for banners and list footers.
import Spinner from "./Spinner.vue";

withDefaults(defineProps<{ label: string; detail?: string; inline?: boolean; size?: number }>(), {
  detail: undefined,
  inline: false,
  size: undefined,
});
</script>

<template>
  <div
    class="loading-state"
    :class="{ inline }"
    role="status"
    aria-live="polite"
    data-testid="loading-state"
  >
    <Spinner :size="size ?? (inline ? 14 : 24)" />
    <div class="loading-text">
      <span class="loading-label">{{ label }}</span>
      <span v-if="detail" class="loading-detail">{{ detail }}</span>
    </div>
  </div>
</template>

<style scoped>
.loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 32px 16px;
  color: var(--color-accent);
  text-align: center;
  animation: loading-fade-in 0.2s ease-out both;
}

.loading-state.inline {
  flex-direction: row;
  gap: 8px;
  padding: 8px 16px;
  text-align: left;
}

.loading-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.loading-label {
  font-size: 13px;
  color: var(--color-text-secondary);
}

.loading-detail {
  font-size: 12px;
  color: var(--color-text-muted);
}

/* Fast operations finish before the placeholder becomes noticeable. */
@keyframes loading-fade-in {
  from {
    opacity: 0;
  }
  60% {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .loading-state {
    animation: none;
  }
}
</style>
