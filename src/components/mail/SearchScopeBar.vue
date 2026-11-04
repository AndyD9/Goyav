<script setup lang="ts">
// Scope chips for the toolbar search: open folder, active account, or all.
import { computed } from "vue";
import { useMessagesStore, type SearchScope } from "@/stores/messages";
import { t } from "@/i18n";

const messagesStore = useMessagesStore();

const scopes = computed<ReadonlyArray<{ value: SearchScope; label: string }>>(() => [
  { value: "folder", label: t("This folder") },
  { value: "account", label: t("This account") },
  { value: "all", label: t("All accounts") },
]);
</script>

<template>
  <div class="scope-row" role="radiogroup" :aria-label="t('Search in')">
    <span class="scope-label">{{ t("Search in") }}</span>
    <button
      v-for="scope in scopes"
      :key="scope.value"
      class="scope-chip"
      :class="{ active: messagesStore.searchScope === scope.value }"
      role="radio"
      :aria-checked="messagesStore.searchScope === scope.value"
      :data-testid="`search-scope-${scope.value}`"
      @click="messagesStore.setSearchScope(scope.value)"
    >{{ scope.label }}</button>
    <slot />
  </div>
</template>

<style scoped>
.scope-row {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.scope-label {
  font-size: 11px;
  color: var(--color-text-muted);
}

.scope-chip {
  padding: 3px 10px;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  background: var(--color-bg);
  color: var(--color-text-secondary);
  font-size: 11px;
  transition: all 0.12s;
}

.scope-chip:hover {
  background: var(--color-bg-hover);
}

.scope-chip.active {
  background: var(--color-accent);
  border-color: var(--color-accent);
  color: white;
}
</style>
