<script setup lang="ts">
// Renderless: keeps the unread inbox count on the app icon of the main
// window. Folder counts are refreshed by the folders store on every
// `folders-changed` event (sync, read/unread, move, delete).
import { computed, onMounted, onUnmounted, watch } from "vue";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAccountsStore } from "@/stores/accounts";
import { useFoldersStore } from "@/stores/folders";
import { useUiStore } from "@/stores/ui";
import { badgeCount, inboxUnreadTotal } from "@/lib/unread-badge";

const accountsStore = useAccountsStore();
const foldersStore = useFoldersStore();
const uiStore = useUiStore();

const mailAccountIds = computed(() =>
  accountsStore.mailAccounts.filter((account) => account.enabled).map((account) => account.id),
);

const count = computed(() =>
  badgeCount(
    inboxUnreadTotal(foldersStore.foldersByAccount, mailAccountIds.value),
    uiStore.unreadBadge,
  ),
);

let applied: number | undefined | null = null;
function apply(value: number | undefined) {
  if (value === applied) return;
  applied = value;
  getCurrentWindow()
    .setBadgeCount(value)
    .catch((error) => console.warn("Unread badge unavailable:", error));
}

watch(count, apply);
watch(
  () => mailAccountIds.value.join(","),
  () => void foldersStore.fetchAllAccountFolders(),
);

onMounted(async () => {
  if (accountsStore.accounts.length === 0) {
    await accountsStore.fetchAccounts().catch(() => undefined);
  }
  await foldersStore.fetchAllAccountFolders();
  apply(count.value);
});

onUnmounted(() => apply(undefined));
</script>

<template>
  <span hidden aria-hidden="true"></span>
</template>
