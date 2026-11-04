<script setup lang="ts">
// Full-panel frame for the account form on desktop: a header with the way
// back to the account list, section tabs, a scrolling body and a sticky
// action bar. Accepts the same `open` / `title` props and default/footer
// slots as ModalShell so the form can render in either.
import { t } from "@/i18n";

export interface AccountPageTab {
  id: string;
  label: string;
}

defineProps<{
  open: boolean;
  title: string;
  subtitle?: string;
  badge?: string;
  color?: { fill: string; soft: string };
  initials?: string;
  tabs: ReadonlyArray<AccountPageTab>;
}>();
const activeTab = defineModel<string>("tab", { required: true });
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <div v-if="open" class="account-page" data-testid="account-page">
    <header class="account-page-header">
      <button
        type="button"
        class="back-btn"
        data-testid="account-page-back"
        :title="t('Back to accounts')"
        @click="emit('close')"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        {{ t("Accounts") }}
      </button>
      <span class="crumb-sep" aria-hidden="true">/</span>
      <span
        v-if="initials"
        class="page-avatar"
        :style="color ? { background: color.soft, color: color.fill } : undefined"
      >{{ initials }}</span>
      <div class="page-title-block">
        <h1 class="page-title">{{ title }}</h1>
        <span v-if="subtitle" class="page-subtitle">{{ subtitle }}</span>
      </div>
      <span
        v-if="badge"
        class="page-badge"
        :style="color ? { background: color.soft, color: color.fill } : undefined"
      >{{ badge }}</span>
    </header>

    <nav v-if="tabs.length > 1" class="account-tabs" role="tablist">
      <button
        v-for="tab in tabs"
        :key="tab.id"
        type="button"
        role="tab"
        class="account-tab"
        :class="{ active: activeTab === tab.id }"
        :aria-selected="activeTab === tab.id"
        :data-testid="`account-tab-${tab.id}`"
        @click="activeTab = tab.id"
      >{{ tab.label }}</button>
    </nav>

    <div class="account-page-body">
      <div class="account-page-content">
        <slot />
      </div>
    </div>

    <footer v-if="$slots.footer" class="account-page-footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.account-page {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.account-page-header {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 56px;
  padding: 8px 24px;
  border-bottom: 0.8px solid var(--color-border);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 30px;
  padding: 0 10px 0 6px;
  border-radius: var(--radius);
  font-size: 13px;
  color: var(--color-text-secondary);
}

.back-btn:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.crumb-sep {
  color: var(--color-text-muted);
}

.page-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 600;
  flex-shrink: 0;
  background: var(--color-bg-tertiary);
}

.page-title-block {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.page-title {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-subtitle {
  font-size: 12px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-badge {
  margin-left: auto;
  flex-shrink: 0;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 500;
}

.account-tabs {
  display: flex;
  gap: 4px;
  padding: 0 20px;
  border-bottom: 0.8px solid var(--color-border);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
  overflow-x: auto;
}

.account-tab {
  position: relative;
  padding: 10px 12px;
  font-size: 13px;
  color: var(--color-text-secondary);
  white-space: nowrap;
}

.account-tab:hover {
  color: var(--color-text);
}

.account-tab.active {
  color: var(--color-accent);
  font-weight: 500;
}

.account-tab.active::after {
  content: "";
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: -1px;
  height: 2px;
  border-radius: 2px;
  background: var(--color-accent);
}

.account-page-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 24px;
}

.account-page-content {
  max-width: 720px;
}

.account-page-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 24px;
  border-top: 0.8px solid var(--color-border);
  background: var(--color-bg-secondary);
  flex-shrink: 0;
}
</style>
