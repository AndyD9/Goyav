<script setup lang="ts">
// Renderless: runs new-mail notifications for the main window, whatever
// view is open.
import { onMounted, onUnmounted } from "vue";
import { createMailNotifier } from "@/lib/mail-notifications";

let stop: (() => void) | null = null;
let unmounted = false;

onMounted(async () => {
  try {
    const dispose = await createMailNotifier().start();
    if (unmounted) dispose();
    else stop = dispose;
  } catch (error) {
    console.error("New-mail notifications unavailable:", error);
  }
});

onUnmounted(() => {
  unmounted = true;
  stop?.();
});
</script>

<template>
  <span hidden aria-hidden="true"></span>
</template>
