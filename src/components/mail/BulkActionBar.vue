<script setup lang="ts">
// Actions on every selected message at once, shown in place of the
// column headers while more than one message (or a message that is not
// open in the reader) is selected.
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { t } from "@/i18n";
import { showToast } from "@/lib/toast";
import { withProgressToast } from "@/lib/loading";
import { useMessagesStore } from "@/stores/messages";
import { useFoldersStore } from "@/stores/folders";
import type { Folder } from "@/lib/types";

const messagesStore = useMessagesStore();
const foldersStore = useFoldersStore();

const count = computed(() => messagesStore.selectedIds.length);
const busy = ref(false);

const activeFolderType = computed(() => {
  const active = foldersStore.activeFolderPath;
  return foldersStore.getFlatFolders().find((f) => f.path === active)?.folder_type ?? null;
});

function folderOfType(type: string): Folder | undefined {
  return foldersStore.getFlatFolders().find((f) => f.folder_type === type);
}

const archiveFolder = computed(() =>
  activeFolderType.value === "archive" ? undefined : folderOfType("archive"),
);
const junkFolder = computed(() =>
  activeFolderType.value === "junk" ? undefined : folderOfType("junk"),
);
const inboxFolder = computed(() =>
  activeFolderType.value === "junk" ? folderOfType("inbox") : undefined,
);

const canMarkRead = computed(() => messagesStore.selectionHasFlag("seen", false));
const canMarkUnread = computed(() => messagesStore.selectionHasFlag("seen", true));
const anyUnstarred = computed(() => messagesStore.selectionHasFlag("flagged", false));

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function markRead(read: boolean) {
  messagesStore.setReadStatus(messagesStore.resolveSelectedIds(), read);
}

function toggleStar() {
  messagesStore.setStarred(messagesStore.resolveSelectedIds(), anyUnstarred.value);
}

async function moveTo(folder: Folder, label: string) {
  if (busy.value) return;
  closeMoveMenu();
  busy.value = true;
  try {
    await withProgressToast(label, () => messagesStore.moveSelected(folder.path));
  } catch (error) {
    console.error("Bulk move failed:", error);
    showToast(t("Action failed: {error}", { error: errorText(error) }), "error", 6000);
  } finally {
    busy.value = false;
  }
}

async function remove() {
  if (busy.value) return;
  busy.value = true;
  try {
    await messagesStore.deleteSelected();
  } finally {
    busy.value = false;
  }
}

// "Move to" popover, teleported so the list's overflow can't clip it.
const moveButton = ref<HTMLElement | null>(null);
const moveMenu = ref<{ left: number; top: number } | null>(null);
const folderQuery = ref("");
const folderQueryInput = ref<HTMLInputElement | null>(null);

const moveTargets = computed(() => {
  const query = folderQuery.value.trim().toLowerCase();
  return foldersStore
    .getFlatFolders()
    .filter((f) => f.path !== foldersStore.activeFolderPath)
    .filter((f) => !query || f.name.toLowerCase().includes(query) || f.path.toLowerCase().includes(query));
});

function toggleMoveMenu() {
  if (moveMenu.value) {
    closeMoveMenu();
    return;
  }
  const rect = moveButton.value?.getBoundingClientRect();
  if (!rect) return;
  const width = 240;
  moveMenu.value = {
    left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
    top: rect.bottom + 4,
  };
  folderQuery.value = "";
  void nextTick(() => folderQueryInput.value?.focus());
}

function closeMoveMenu() {
  moveMenu.value = null;
}

function onFolderQueryKeydown(event: KeyboardEvent) {
  if (event.key === "Enter" && moveTargets.value.length > 0) {
    event.preventDefault();
    const folder = moveTargets.value[0];
    void moveTo(folder, t("Moving {count} message(s)...", { count: count.value }));
  } else if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    closeMoveMenu();
  }
}

function onDocumentMouseDown(event: MouseEvent) {
  if (!moveMenu.value) return;
  const target = event.target as HTMLElement | null;
  if (target?.closest(".bulk-move-menu") || target?.closest("[data-testid='bulk-move']")) return;
  closeMoveMenu();
}

onMounted(() => document.addEventListener("mousedown", onDocumentMouseDown));
onUnmounted(() => document.removeEventListener("mousedown", onDocumentMouseDown));
</script>

<template>
  <div class="bulk-bar" data-testid="bulk-action-bar" @click.stop>
    <span class="bulk-count" data-testid="bulk-count">
      {{ t("{count} selected", { count }) }}
    </span>

    <div class="bulk-actions">
      <button
        v-if="canMarkRead"
        class="bulk-btn"
        data-testid="bulk-mark-read"
        :title="t('Mark Read')"
        :aria-label="t('Mark Read')"
        @click="markRead(true)"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21.2 8.4c.5.38.8.97.8 1.6v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V10a2 2 0 0 1 .8-1.6l8-6a2 2 0 0 1 2.4 0l8 6Z" /><path d="m22 10-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 10" /></svg>
      </button>
      <button
        v-if="canMarkUnread"
        class="bulk-btn"
        data-testid="bulk-mark-unread"
        :title="t('Mark Unread')"
        :aria-label="t('Mark Unread')"
        @click="markRead(false)"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /><circle cx="19" cy="5" r="3" fill="currentColor" /></svg>
      </button>
      <button
        class="bulk-btn"
        data-testid="bulk-star"
        :class="{ on: !anyUnstarred }"
        :title="anyUnstarred ? t('Star') : t('Unstar')"
        :aria-label="anyUnstarred ? t('Star') : t('Unstar')"
        @click="toggleStar"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" :fill="anyUnstarred ? 'none' : 'currentColor'" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
      </button>

      <span class="bulk-sep" />

      <button
        v-if="archiveFolder"
        class="bulk-btn"
        data-testid="bulk-archive"
        :disabled="busy"
        :title="t('Archive')"
        :aria-label="t('Archive')"
        @click="moveTo(archiveFolder, t('Archiving {count} message(s)…', { count }))"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="5" rx="1" /><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" /><path d="M10 12h4" /></svg>
      </button>
      <button
        v-if="junkFolder"
        class="bulk-btn"
        data-testid="bulk-spam"
        :disabled="busy"
        :title="t('Report spam')"
        :aria-label="t('Report spam')"
        @click="moveTo(junkFolder, t('Moving {count} message(s) to spam…', { count }))"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
      </button>
      <button
        v-if="inboxFolder"
        class="bulk-btn"
        data-testid="bulk-not-spam"
        :disabled="busy"
        :title="t('Not Spam')"
        :aria-label="t('Not Spam')"
        @click="moveTo(inboxFolder, t('Moving {count} message(s)...', { count }))"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
      </button>
      <button
        ref="moveButton"
        class="bulk-btn"
        data-testid="bulk-move"
        :class="{ on: !!moveMenu }"
        :disabled="busy"
        :title="t('Move To')"
        :aria-label="t('Move To')"
        aria-haspopup="menu"
        :aria-expanded="!!moveMenu"
        @click="toggleMoveMenu"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /><path d="M12 11v6" /><path d="m9 14 3 3 3-3" /></svg>
      </button>
      <button
        class="bulk-btn danger"
        data-testid="bulk-delete"
        :disabled="busy"
        :title="t('Delete')"
        :aria-label="t('Delete')"
        @click="remove"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
      </button>
    </div>

    <button
      class="bulk-btn bulk-clear"
      data-testid="bulk-clear"
      :title="t('Clear selection')"
      :aria-label="t('Clear selection')"
      @click="messagesStore.clearSelection()"
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
    </button>

    <Teleport to="body">
      <div
        v-if="moveMenu"
        class="bulk-move-menu"
        role="menu"
        data-testid="bulk-move-menu"
        :style="{ left: moveMenu.left + 'px', top: moveMenu.top + 'px' }"
      >
        <input
          ref="folderQueryInput"
          v-model="folderQuery"
          type="search"
          class="bulk-move-filter"
          data-testid="bulk-move-filter"
          :placeholder="t('Find a folder')"
          :aria-label="t('Find a folder')"
          @keydown="onFolderQueryKeydown"
        />
        <div class="bulk-move-list">
          <button
            v-for="folder in moveTargets"
            :key="folder.path"
            class="bulk-move-item"
            role="menuitem"
            :data-testid="`bulk-move-${folder.name}`"
            :title="folder.path"
            @click="moveTo(folder, t('Moving {count} message(s)...', { count }))"
          >{{ folder.name }}</button>
          <div v-if="moveTargets.length === 0" class="bulk-move-empty">
            {{ t("No matching folder") }}
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.bulk-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px 8px;
  flex: 1;
  min-width: 0;
  padding: 0 8px 0 4px;
}

.bulk-count {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-text);
  white-space: nowrap;
}

.bulk-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  flex-wrap: wrap;
}

.bulk-sep {
  width: 1px;
  height: 16px;
  margin: 0 4px;
  background: var(--color-border);
}

.bulk-btn {
  width: 28px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  color: var(--color-text-secondary);
  transition: background 0.12s, color 0.12s;
}

.bulk-btn:hover:not(:disabled) {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.bulk-btn.on {
  color: var(--color-accent);
}

.bulk-btn.danger:hover:not(:disabled) {
  color: var(--color-danger-text);
  background: rgba(251, 44, 54, 0.08);
}

.bulk-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.bulk-clear {
  margin-left: auto;
}
</style>

<style>
/* Teleported to <body>, so these can't be scoped. */
.bulk-move-menu {
  position: fixed;
  z-index: 9999;
  width: 240px;
  background: var(--color-bg);
  border: 0.8px solid var(--color-border);
  border-radius: 8px;
  padding: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}

.bulk-move-filter {
  width: 100%;
  box-sizing: border-box;
  height: 28px;
  padding: 0 8px;
  margin-bottom: 4px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: var(--color-bg-tertiary);
  color: var(--color-text);
  font-size: 12.5px;
  font-family: var(--font-sans);
}

.bulk-move-filter:focus {
  outline: none;
  border-color: var(--color-accent);
}

.bulk-move-list {
  max-height: 320px;
  overflow-y: auto;
}

.bulk-move-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  border-radius: 4px;
  text-align: left;
  font-size: 13px;
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bulk-move-item:hover,
.bulk-move-item:focus-visible {
  background: var(--color-bg-hover);
  outline: none;
}

.bulk-move-empty {
  padding: 8px 12px;
  font-size: 12px;
  color: var(--color-text-muted);
}
</style>
