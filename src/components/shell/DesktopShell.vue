<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import Sidebar from "@/components/common/Sidebar.vue";
import MenuBar from "@/components/common/MenuBar.vue";
import StatusBar from "@/components/common/StatusBar.vue";
import OperationsPanel from "@/components/common/OperationsPanel.vue";
import LinkPopup from "@/components/common/LinkPopup.vue";
import WhatsNewDialog from "@/components/changelog/WhatsNewDialog.vue";
import MailNotifier from "@/components/common/MailNotifier.vue";
import UnreadBadge from "@/components/common/UnreadBadge.vue";
import UpdateNotice from "@/components/common/UpdateNotice.vue";
import { useUpdatesStore } from "@/stores/updates";

const route = useRoute();
const updatesStore = useUpdatesStore();

// Compose and reader windows are standalone — hide the main app chrome
const isStandaloneWindow = computed(
  () => route.name === "compose" || route.name === "reader",
);

// Mail, Calendar and Settings split themselves into several panels;
// every other view is shown inside a single panel.
const viewHasOwnPanels = computed(
  () =>
    route.name === "mail" ||
    route.name === "calendar" ||
    route.name === "settings",
);

onMounted(() => {
  // Standalone compose/reader windows leave updates to the main window.
  if (!isStandaloneWindow.value) void updatesStore.init();
});
</script>

<template>
  <div v-if="isStandaloneWindow" class="standalone-shell">
    <router-view />
    <LinkPopup />
  </div>

  <div v-else class="app-shell">
    <Sidebar />
    <div class="app-main">
      <MenuBar />
      <main class="app-content" :class="{ 'app-panel': !viewHasOwnPanels }">
        <router-view v-slot="{ Component }">
          <!-- Only CalendarView is kept alive — its WeekView subtree is
               the heavy one (see #72) and cold-mount is ~400ms. Other
               views (ContactsView, FiltersView, SettingsView, MailView)
               rely on onMounted/onUnmounted for listener and interval
               cleanup, so caching them would leak background work. -->
          <KeepAlive include="CalendarView">
            <component :is="Component" />
          </KeepAlive>
        </router-view>
      </main>
      <OperationsPanel />
      <StatusBar />
    </div>
    <LinkPopup />
    <WhatsNewDialog />
    <MailNotifier />
    <UnreadBadge />
    <UpdateNotice />
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

.app-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.app-content {
  flex: 1;
  overflow: hidden;
  margin-right: var(--panel-gap);
}

.app-content.app-panel {
  margin-bottom: var(--panel-gap);
}

.standalone-shell {
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}
</style>
