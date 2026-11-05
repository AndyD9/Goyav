<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute } from "vue-router";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useActivityStore } from "@/stores/activity";
import { useOpsStore } from "@/stores/ops";
import { useUiStore } from "@/stores/ui";
import { useAccountsStore } from "@/stores/accounts";
import { useFoldersStore } from "@/stores/folders";
import { useCalendarStore } from "@/stores/calendar";
import { useUpdatesStore } from "@/stores/updates";
import * as api from "@/lib/tauri";
import { t, tn } from "@/i18n";

const route = useRoute();
const activityStore = useActivityStore();
const opsStore = useOpsStore();
const uiStore = useUiStore();
const accountsStore = useAccountsStore();
const foldersStore = useFoldersStore();
const calendarStore = useCalendarStore();
const updatesStore = useUpdatesStore();
const lastSyncTime = ref<Date | null>(null);
const connectionStatus = ref<"connected" | "disconnected">("connected");
const syncError = ref<string | null>(null);

const unlistenFns: UnlistenFn[] = [];

onMounted(async () => {
  await opsStore.initEventListeners();

  unlistenFns.push(
    await listen("idle-disconnected", () => {
      connectionStatus.value = "disconnected";
    }),
  );
  unlistenFns.push(
    await listen("idle-reconnected", () => {
      connectionStatus.value = "connected";
      syncError.value = null;
    }),
  );
  unlistenFns.push(
    await listen<{ error: string }>("sync-error", (event) => {
      connectionStatus.value = "disconnected";
      syncError.value = event.payload.error;
    }),
  );
  unlistenFns.push(
    await listen("sync-complete", () => {
      connectionStatus.value = "connected";
      syncError.value = null;
    }),
  );
});

onUnmounted(() => {
  for (const unlisten of unlistenFns) {
    unlisten();
  }
});

const lastSyncLabel = computed(() => {
  if (!lastSyncTime.value) return "";
  const diff = Math.floor((Date.now() - lastSyncTime.value.getTime()) / 1000);
  if (diff < 60) return t("Last sync just now");
  if (diff < 3600) return tn(Math.floor(diff / 60), "Last sync {count} minute ago", "Last sync {count} minutes ago");
  return tn(Math.floor(diff / 3600), "Last sync {count} hour ago", "Last sync {count} hours ago");
});

async function syncAll() {
  const isCalendar = route.name === "calendar";
  const isContacts = route.name === "contacts";

  for (const account of accountsStore.accounts) {
    if (!account.enabled) continue;
    try {
      if (isCalendar) {
        await api.syncCalendars(account.id, true);
      } else if (isContacts) {
        await api.syncContacts(account.id);
      } else {
        await api.triggerSync(
          account.id,
          foldersStore.activeFolderPath ?? undefined,
        );
      }
    } catch (error) {
      console.error("Sync failed:", error);
    }
  }

  if (isCalendar) {
    await calendarStore.fetchCalendars();
    await calendarStore.fetchEvents();
  }

  lastSyncTime.value = new Date();
}
</script>

<template>
  <div class="status-bar">
    <div class="status-left">
      <button class="sync-btn" :title="t('Sync')" @click="syncAll">
        <span class="sync-icon" :class="{ spinning: activityStore.hasActiveOperations }">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
          </svg>
        </span>
        {{ t("Sync") }}
      </button>
      <span v-if="activityStore.hasActiveOperations" class="op-spinner"></span>
      <span
        class="status-dot"
        :class="[connectionStatus, { idle: accountsStore.accounts.length === 0 }]"
        data-testid="sync-status"
      ></span>
      <span
        v-if="uiStore.hoverUrl"
        class="hover-url"
        data-testid="status-hover-url"
        :title="uiStore.hoverUrl"
      >{{ uiStore.hoverUrl }}</span>
      <span v-else-if="syncError" class="sync-error-msg" data-testid="sync-error">{{ syncError }}</span>
      <button v-else-if="opsStore.hasFailures" class="sync-error-msg" data-testid="op-failure" @click="opsStore.clearFailures()" :title="t('Click to dismiss')">{{ opsStore.recentFailures[0]?.error }}</button>
      <span v-else-if="connectionStatus === 'disconnected'" class="disconnect-msg">{{ t("Offline, reconnecting...") }}</span>
      <span v-else class="account-info">{{ tn(accountsStore.accounts.length, '{count} account connected', '{count} accounts connected') }}</span>
    </div>
    <div class="status-right">
      <button
        v-if="updatesStore.available && !updatesStore.noticeVisible && updatesStore.phase === 'idle'"
        class="update-pill"
        data-testid="status-update"
        :title="t('Show the update')"
        @click="updatesStore.reopen()"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
        {{ t("Update {version}", { version: updatesStore.available.version }) }}
      </button>
      <span v-if="lastSyncLabel" class="last-sync">{{ lastSyncLabel }}</span>
      <button
        class="ops-toggle-btn"
        :class="{ active: uiStore.operationsPanelOpen }"
        :title="t('Operations')"
        data-testid="ops-toggle-btn"
        @click="uiStore.toggleOperationsPanel()"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
        <span v-if="activityStore.activeOperations.length > 0" class="ops-badge">{{ activityStore.activeOperations.length }}</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.status-bar {
  height: 32px;
  background: var(--color-ground);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  font-size: 11px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.update-pill {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px;
  border-radius: 12px;
  background: var(--color-accent-light);
  color: var(--color-accent);
  font-size: 11px;
  font-weight: 600;
}

.update-pill:hover {
  background: var(--color-accent);
  color: white;
}

.status-left,
.status-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sync-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--color-text-muted);
  padding: 2px 8px;
  border-radius: 4px;
  transition: background 0.12s;
}

.sync-btn:hover {
  background: var(--color-bg-hover);
}

.sync-icon {
  display: flex;
  align-items: center;
}

.sync-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-sync-green);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-sync-green) 22%, transparent);
  flex-shrink: 0;
}

.status-dot.disconnected {
  background: var(--color-danger);
}

/* Nothing to sync yet: neither connected nor failing. */
.status-dot.idle {
  background: var(--color-text-muted);
  box-shadow: none;
}

.sync-error-msg {
  color: var(--color-danger-text);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  /* Reset <button> browser defaults so it looks like inline text */
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  font-family: inherit;
}

.disconnect-msg {
  color: var(--color-warning);
}

.op-spinner {
  width: 12px;
  height: 12px;
  border: 1.5px solid var(--color-border);
  border-top-color: var(--color-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  flex-shrink: 0;
}

.account-info {
  white-space: nowrap;
}

.hover-url {
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
  max-width: 70vw;
}

.last-sync {
  white-space: nowrap;
  color: var(--color-text-muted);
}

.ops-toggle-btn {
  display: grid;
  place-items: center;
  position: relative;
  width: 24px;
  height: 20px;
  border-radius: 4px;
  color: var(--color-text-muted);
  transition: all 0.12s;
}

.ops-toggle-btn:hover,
.ops-toggle-btn.active {
  color: var(--color-text);
  background: var(--color-bg-hover);
}

.ops-badge {
  position: absolute;
  top: -2px;
  right: -2px;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  background: var(--color-accent);
  color: #fff;
  font-size: 9px;
  font-weight: 600;
  display: grid;
  place-items: center;
  padding: 0 4px;
}
</style>
