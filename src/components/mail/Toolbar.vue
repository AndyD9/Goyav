<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { useMessagesStore } from "@/stores/messages";
import { useAccountsStore } from "@/stores/accounts";
import { useFoldersStore } from "@/stores/folders";
import { openComposeWindow } from "@/lib/compose-window";
import * as api from "@/lib/tauri";
import { t } from "@/i18n";

const messagesStore = useMessagesStore();
const accountsStore = useAccountsStore();
const foldersStore = useFoldersStore();

const isJunkFolder = computed(() => {
  const active = foldersStore.activeFolderPath;
  if (!active) return false;
  const folder = foldersStore.folders.find((f) => f.path === active);
  return folder?.folder_type === "junk";
});

const hasSelection = computed(() => messagesStore.selectedIds.length > 0);

const searchInput = ref<HTMLInputElement | null>(null);

function onSearchInput(event: Event) {
  messagesStore.setSearchText((event.target as HTMLInputElement).value);
}

function onSearchKeydown(event: KeyboardEvent) {
  if (event.key === "Enter") {
    event.preventDefault();
    void messagesStore.runSearch();
  } else if (event.key === "Escape") {
    event.preventDefault();
    messagesStore.clearSearch();
    searchInput.value?.blur();
  }
}

// Cmd/Ctrl+F focuses the search box from anywhere in the mail view.
function onWindowKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "f") {
    if (!searchInput.value) return;
    event.preventDefault();
    searchInput.value.focus();
    searchInput.value.select();
  }
}

onMounted(() => window.addEventListener("keydown", onWindowKeydown));
onUnmounted(() => window.removeEventListener("keydown", onWindowKeydown));

async function markNotSpam() {
  const accountId = accountsStore.activeAccountId;
  if (!accountId || !hasSelection.value) return;
  const inboxFolder = foldersStore.folders.find((f) => f.folder_type === "inbox");
  if (!inboxFolder) return;
  const ids = messagesStore.resolveSelectedIds();
  try {
    await api.moveMessages(accountId, ids, inboxFolder.path);
    messagesStore.clearSelection();
    messagesStore.activeMessage = null;
    messagesStore.activeMessageId = null;
  } catch (e) {
    console.error("Not Spam failed:", e);
  }
}
</script>

<template>
  <div class="toolbar">
    <button class="compose-btn" :title="t('Compose new email')" data-testid="btn-compose" @click="openComposeWindow({ accountId: accountsStore.activeAccountId ?? undefined })">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
      </svg>
      {{ t("Compose") }}
    </button>

    <button
      v-if="isJunkFolder && hasSelection"
      class="not-spam-btn"
      :title="t('Move to Inbox')"
      data-testid="btn-not-spam"
      @click="markNotSpam"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      {{ t("Not Spam") }}
    </button>

    <span v-if="messagesStore.selectedIds.length > 1" class="selection-count">
      {{ t("{count} selected", { count: messagesStore.selectedIds.length }) }}
    </span>

    <div class="search-box" :class="{ filled: messagesStore.searchText }">
      <svg class="search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
      <input
        ref="searchInput"
        type="search"
        class="search-input"
        data-testid="mail-search-input"
        :value="messagesStore.searchText"
        :placeholder="t('Search mail')"
        :aria-label="t('Search mail')"
        @input="onSearchInput"
        @keydown="onSearchKeydown"
      />
      <button
        v-if="messagesStore.searchText"
        class="search-clear"
        data-testid="mail-search-clear"
        :aria-label="t('Clear search')"
        :title="t('Clear search')"
        @click="messagesStore.clearSearch()"
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
/* Matches the calendar / contacts toolbars in height, padding,
   background, and border so all three views show a uniform top
   strip — see #150. */
.toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 48px;
  padding: 0 16px;
  background: var(--color-bg-secondary);
  border-bottom: 0.8px solid var(--color-border);
  flex-shrink: 0;
}

.compose-btn {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
  gap: 8px;
  background: var(--color-accent);
  color: white;
  font-weight: 500;
  font-size: 13px;
  border-radius: 20px;
  padding: 8px 16px;
  transition: all 0.15s;
}

.compose-btn:hover {
  background: var(--color-accent-hover);
}

.not-spam-btn {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  white-space: nowrap;
  gap: 8px;
  background: var(--color-bg-hover);
  color: var(--color-text);
  font-weight: 500;
  font-size: 13px;
  border-radius: 20px;
  padding: 8px 16px;
  transition: all 0.15s;
}

.not-spam-btn:hover {
  background: var(--color-status-dot);
  color: white;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: auto;
  flex: 0 1 260px;
  min-width: 120px;
}

.search-icon {
  position: absolute;
  left: 12px;
  color: var(--color-text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 32px;
  padding: 0 28px 0 32px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  font-size: 12.5px;
  font-family: var(--font-sans);
  transition: border-color 0.12s, background 0.12s;
}

.search-input::-webkit-search-cancel-button {
  display: none;
}

.search-input::placeholder {
  color: var(--color-text-muted);
}

.search-input:focus,
.search-box.filled .search-input {
  outline: none;
  border-color: var(--color-accent);
  background: var(--color-bg);
}

.search-clear {
  position: absolute;
  right: 8px;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--color-text-muted);
}

.search-clear:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.selection-count {
  font-size: 11px;
  font-weight: 500;
  color: var(--color-text-muted);
}
</style>
