<script setup lang="ts">
import { t } from "@/i18n";
defineProps<{ errors: string[] }>();
</script>

<template>
  <details v-if="errors.length" class="calendar-incomplete calendar-display-notice" role="alert">
    <summary>{{ t("Calendar incomplete: {count} issue(s). Show details", { count: errors.length }) }}</summary>
    <ul>
      <li v-for="(error, index) in errors" :key="index">{{ error }}</li>
    </ul>
  </details>
</template>

<style scoped>
.calendar-display-notice {
  flex-shrink: 0;
  max-height: min(22vh, 160px);
  overflow-y: auto;
  overflow-wrap: anywhere;
  padding: 6px 14px;
  font-size: 12px;
  background: var(--color-bg-secondary);
  color: var(--color-text);
}
summary {
  cursor: pointer;
}
ul {
  margin: 8px 0;
  padding-left: 18px;
}
li + li {
  margin-top: 6px;
}
</style>
