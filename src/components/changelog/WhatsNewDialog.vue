<script setup lang="ts">
// Shown once after an update with the releases the user has not seen yet.
import { onMounted, ref } from "vue";
import ModalShell from "@/components/common/ModalShell.vue";
import ChangelogList from "./ChangelogList.vue";
import { markVersionSeen, unseenReleases, type ChangelogRelease } from "@/lib/changelog";
import { t } from "@/i18n";

const version = __APP_VERSION__;
const releases = ref<ChangelogRelease[]>([]);
const open = ref(false);

onMounted(() => {
  releases.value = unseenReleases(version);
  open.value = releases.value.length > 0;
});

function close() {
  open.value = false;
  markVersionSeen(version);
}
</script>

<template>
  <ModalShell
    :open="open"
    :title="t('What\'s new in Goyav {version}', { version })"
    modal-class="whats-new-modal"
    data-testid="whats-new-dialog"
    @close="close"
  >
    <ChangelogList :releases="releases" :current="version" />
    <template #footer>
      <button class="whats-new-ok" data-testid="whats-new-close" @click="close">{{ t("Got it") }}</button>
    </template>
  </ModalShell>
</template>

<style scoped>
.whats-new-ok {
  height: 36px;
  padding: 0 20px;
  border-radius: 8px;
  background: var(--color-accent);
  color: white;
  font-size: 14px;
  font-weight: 500;
}

.whats-new-ok:hover {
  background: var(--color-accent-hover);
}
</style>
