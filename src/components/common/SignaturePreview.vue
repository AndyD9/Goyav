<script setup lang="ts">
import { onUnmounted, ref, watch } from "vue";
import { t } from "@/i18n";
import * as api from "@/lib/tauri";
import { htmlSignatureBody } from "@/lib/signature";

// Renders an HTML signature the way recipients see it: on white, in a
// script-less sandbox, with remote images inlined by the backend (the
// app CSP blocks direct https images).
const props = defineProps<{ html: string }>();

const srcdoc = ref("");
const height = ref(0);
let seq = 0;
let debounce: ReturnType<typeof setTimeout> | null = null;

function documentFor(body: string): string {
  return `<!DOCTYPE html>
<html>
<head>
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<style>
  html, body { margin: 0; background: #fff; color: #0a0908; }
  body { padding: 12px 16px; font-family: Arial, Helvetica, sans-serif; font-size: 13px; }
</style>
</head>
<body>${body}</body>
</html>`;
}

async function render(html: string) {
  const id = ++seq;
  const body = htmlSignatureBody(html);
  srcdoc.value = documentFor(body);
  try {
    const inlined = await api.getSignaturePreviewHtml(body);
    if (id === seq) srcdoc.value = documentFor(inlined);
  } catch (e) {
    console.error("Failed to load signature images:", e);
  }
}

// allow-same-origin without allow-scripts lets us size the frame from
// its document while nothing inside it can run.
function onLoad(e: Event) {
  const doc = (e.target as HTMLIFrameElement).contentDocument;
  height.value = doc?.documentElement.scrollHeight ?? 0;
}

watch(
  () => props.html,
  (html) => {
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(() => void render(html), srcdoc.value ? 400 : 0);
  },
  { immediate: true },
);

onUnmounted(() => {
  if (debounce) clearTimeout(debounce);
  seq++;
});
</script>

<template>
  <iframe
    class="signature-preview"
    data-testid="signature-preview"
    :title="t('Signature preview')"
    sandbox="allow-same-origin"
    :srcdoc="srcdoc"
    :style="height ? { height: `${height}px` } : undefined"
    @load="onLoad"
  ></iframe>
</template>

<style scoped>
.signature-preview {
  display: block;
  width: 100%;
  min-height: 60px;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  background: #fff;
}
</style>
