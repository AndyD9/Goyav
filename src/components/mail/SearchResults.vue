<script setup lang="ts">
// Results of the toolbar search when it spans several folders or accounts.
// Replaces the folder message list while a search is active.
import { computed, watch } from "vue";
import { useMessagesStore } from "@/stores/messages";
import { useAccountsStore } from "@/stores/accounts";
import { useFoldersStore } from "@/stores/folders";
import { useUiStore } from "@/stores/ui";
import { acctColor } from "@/lib/account-colors";
import type { Folder, LocalSearchHit } from "@/lib/types";
import { t, tn, dateLocale } from "@/i18n";
import SearchScopeBar from "./SearchScopeBar.vue";

const emit = defineEmits<{
  openMessage: [messageId: string];
}>();

const messagesStore = useMessagesStore();
const accountsStore = useAccountsStore();
const foldersStore = useFoldersStore();
const uiStore = useUiStore();

// Other accounts' folder trees are only loaded on demand.
watch(
  () => messagesStore.searchScope,
  (scope) => {
    if (scope === "all") void foldersStore.fetchAllAccountFolders();
  },
  { immediate: true },
);

function flatten(tree: Folder[], out: Map<string, string>) {
  for (const folder of tree) {
    out.set(folder.path, folder.name);
    flatten(folder.children, out);
  }
}

const folderNames = computed(() => {
  const byAccount = new Map<string, Map<string, string>>();
  for (const account of accountsStore.accounts) {
    const names = new Map<string, string>();
    flatten(foldersStore.getAccountFolders(account.id), names);
    byAccount.set(account.id, names);
  }
  return byAccount;
});

function folderLabel(hit: LocalSearchHit): string {
  const name = folderNames.value.get(hit.account_id)?.get(hit.folder_path);
  if (name) return name;
  const parts = hit.folder_path.split(/[/.]/);
  return parts[parts.length - 1] || hit.folder_path;
}

function accountLabel(accountId: string): string {
  const account = accountsStore.accounts.find((a) => a.id === accountId);
  return account?.display_name || account?.email || accountId;
}

const showAccount = computed(
  () => messagesStore.searchScope === "all" && accountsStore.accounts.length > 1,
);

const summary = computed(() => {
  const total = messagesStore.searchTotal;
  const shown = messagesStore.searchResults.length;
  if (total > shown) {
    return t("Showing the {shown} most recent of {total} results", { shown, total });
  }
  return tn(total, "{count} result", "{count} results");
});

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString(dateLocale(), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: uiStore.hour12,
    });
  }
  return date.toLocaleDateString(dateLocale(), {
    day: "numeric",
    month: "short",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

function formatServerDate(seconds: number): string {
  return formatDate(new Date(seconds * 1000).toISOString());
}

// Highlight searched words without injecting HTML: split into segments.
const searchWords = computed(() =>
  messagesStore.searchText
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
);

function segments(text: string | null): Array<{ text: string; match: boolean }> {
  if (!text) return [];
  if (searchWords.value.length === 0) return [{ text, match: false }];
  // With a capturing group, split() puts the matches at odd indices.
  return text
    .split(new RegExp(`(${searchWords.value.join("|")})`, "gi"))
    .map((part, index) => ({ text: part, match: index % 2 === 1 }))
    .filter((part) => part.text !== "");
}

async function open(hit: LocalSearchHit) {
  await messagesStore.openSearchHit(hit);
  emit("openMessage", hit.id);
}
</script>

<template>
  <div class="search-results" data-testid="search-results">
    <div class="search-head">
      <SearchScopeBar />
      <div class="summary-row">
        <span v-if="messagesStore.searchLoading" class="summary">{{ t("Searching…") }}</span>
        <span v-else class="summary" data-testid="search-summary">{{ summary }}</span>
        <button
          v-if="messagesStore.searchScope === 'account'"
          class="server-btn"
          data-testid="search-results-server"
          :disabled="messagesStore.serverSearchLoading"
          @click="messagesStore.runServerSearch()"
        >
          {{ messagesStore.serverSearchLoading ? t("Searching server…") : t("Also search the server") }}
        </button>
      </div>
      <div v-if="messagesStore.searchError" class="search-error" role="alert">
        {{ messagesStore.searchError }}
      </div>
    </div>

    <div class="results-scroll">
      <div
        v-if="!messagesStore.searchLoading && messagesStore.searchResults.length === 0 && !messagesStore.searchError"
        class="empty"
        data-testid="search-empty"
      >
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        <p>{{ t("No messages match “{query}”.", { query: messagesStore.searchText.trim() }) }}</p>
        <p class="empty-hint">{{ t("Only messages already synced to this device are searched.") }}</p>
      </div>

      <button
        v-for="hit in messagesStore.searchResults"
        :key="`${hit.account_id}:${hit.id}`"
        type="button"
        class="hit"
        :class="{
          unread: !hit.flags.includes('seen'),
          active: messagesStore.activeMessageId === hit.id,
        }"
        data-testid="search-hit"
        @click="open(hit)"
      >
        <span
          v-if="showAccount"
          class="hit-account-bar"
          :style="{ background: acctColor(hit.account_id).fill }"
        ></span>
        <div class="hit-line">
          <span class="hit-from">
            <template v-for="(seg, i) in segments(hit.from_name || hit.from_email || t('(unknown sender)'))" :key="i">
              <mark v-if="seg.match">{{ seg.text }}</mark><template v-else>{{ seg.text }}</template>
            </template>
          </span>
          <svg v-if="hit.has_attachments" class="hit-clip" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" :aria-label="t('Has attachments')"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
          <span class="hit-date">{{ formatDate(hit.date) }}</span>
        </div>
        <div class="hit-subject">
          <template v-for="(seg, i) in segments(hit.subject || t('(no subject)'))" :key="i">
            <mark v-if="seg.match">{{ seg.text }}</mark><template v-else>{{ seg.text }}</template>
          </template>
        </div>
        <div v-if="hit.snippet" class="hit-snippet">
          <template v-for="(seg, i) in segments(hit.snippet)" :key="i">
            <mark v-if="seg.match">{{ seg.text }}</mark><template v-else>{{ seg.text }}</template>
          </template>
        </div>
        <div class="hit-meta">
          <span class="hit-folder">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            {{ folderLabel(hit) }}
          </span>
          <span
            v-if="showAccount"
            class="hit-account"
            :style="{ color: acctColor(hit.account_id).fill }"
          >{{ accountLabel(hit.account_id) }}</span>
        </div>
      </button>

      <template v-if="messagesStore.serverHits.length">
        <div class="section-title">{{ t("On the server") }}</div>
        <button
          v-for="hit in messagesStore.serverHits"
          :key="`server:${hit.backend_id}`"
          type="button"
          class="hit"
          data-testid="search-server-hit"
          @click="messagesStore.openServerHit(hit)"
        >
          <div class="hit-line">
            <span class="hit-from">{{ hit.from_name || hit.from_email || t("(unknown sender)") }}</span>
            <span class="hit-date">{{ formatServerDate(hit.date) }}</span>
          </div>
          <div class="hit-subject">{{ hit.subject || t("(no subject)") }}</div>
          <div v-if="hit.snippet" class="hit-snippet">{{ hit.snippet }}</div>
        </button>
      </template>
      <div v-if="messagesStore.serverSearchError" class="search-error" role="alert">
        {{ messagesStore.serverSearchError }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.search-results {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--color-bg);
}

.search-head {
  padding: 8px 12px;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-bg-secondary);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.summary-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
}

.summary {
  font-size: 11px;
  color: var(--color-text-muted);
}

.server-btn {
  font-size: 11px;
  color: var(--color-accent);
  padding: 2px 4px;
  border-radius: 4px;
}

.server-btn:hover:not(:disabled) {
  background: var(--color-accent-light);
}

.server-btn:disabled {
  opacity: 0.6;
  cursor: progress;
}

.search-error {
  font-size: 11px;
  color: var(--color-danger-text);
  padding: 4px 12px;
}

.results-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 48px 24px;
  text-align: center;
  color: var(--color-text-muted);
  font-size: 13px;
}

.empty-hint {
  font-size: 11px;
}

.hit {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 16px 8px 16px;
  border-bottom: 1px solid var(--color-divider);
  text-align: left;
  transition: background 0.1s;
}

.hit:hover {
  background: var(--color-bg-hover);
}

.hit.active {
  background: var(--color-bg-active);
}

.hit-account-bar {
  position: absolute;
  left: 0;
  top: 8px;
  bottom: 8px;
  width: 4px;
  border-radius: 2px;
}

.hit-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.hit-from {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.hit.unread .hit-from,
.hit.unread .hit-subject {
  color: var(--color-unread);
  font-weight: 600;
}

.hit-clip {
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.hit-date {
  font-size: 11px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.hit-subject {
  font-size: 13px;
  color: var(--color-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hit-snippet {
  font-size: 12px;
  color: var(--color-text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hit-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 2px;
  font-size: 11px;
  color: var(--color-text-muted);
}

.hit-folder {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.hit-account {
  font-weight: 500;
}

mark {
  background: color-mix(in srgb, var(--color-warning) 28%, transparent);
  color: inherit;
  border-radius: 2px;
}

.section-title {
  padding: 12px 16px 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}
</style>
