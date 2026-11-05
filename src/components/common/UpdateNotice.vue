<script setup lang="ts">
// Floating card announcing a new Goyav release, with what changed and an
// install button. "Later" hides it for this session; the status bar keeps
// a pill to bring it back.
import { computed } from "vue";
import { useUpdatesStore } from "@/stores/updates";
import { parseReleaseNotes } from "@/lib/release-notes";
import type { ChangeKind } from "@/lib/changelog";
import { t, tn, dateLocale } from "@/i18n";

const MAX_ITEMS = 5;

const updates = useUpdatesStore();

const KIND_LABELS: Record<ChangeKind, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

const notes = computed(() => {
  const items = parseReleaseNotes(updates.available?.notes).flatMap((section) =>
    section.items.map((text) => ({ kind: section.kind, text })),
  );
  return { shown: items.slice(0, MAX_ITEMS), hidden: Math.max(0, items.length - MAX_ITEMS) };
});

const published = computed(() => {
  const seconds = updates.available?.publishedAt;
  if (!seconds) return "";
  return new Date(seconds * 1000).toLocaleDateString(dateLocale(), {
    day: "numeric",
    month: "long",
  });
});
</script>

<template>
  <Transition name="update-notice">
    <aside
      v-if="updates.noticeVisible && updates.available"
      class="update-notice"
      role="dialog"
      aria-labelledby="update-notice-title"
      data-testid="update-notice"
    >
      <header class="notice-head">
        <span class="notice-icon" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </span>
        <div class="notice-heading">
          <h2 id="update-notice-title" class="notice-title">{{ t("Update available") }}</h2>
          <p class="notice-versions" data-testid="update-notice-version">
            {{ t("Goyav {version}", { version: updates.available.version }) }}
            <span class="notice-muted">· {{ t("you have {version}", { version: updates.available.currentVersion }) }}</span>
            <span v-if="published" class="notice-muted">· {{ published }}</span>
          </p>
        </div>
        <button
          class="notice-close"
          :aria-label="t('Close')"
          data-testid="update-notice-close"
          @click="updates.dismiss()"
        >&times;</button>
      </header>

      <ul v-if="notes.shown.length > 0" class="notice-notes" data-testid="update-notice-notes">
        <li v-for="(note, i) in notes.shown" :key="i" class="notice-note">
          <span class="kind" :class="`kind-${note.kind}`">{{ t(KIND_LABELS[note.kind]) }}</span>
          <span>{{ note.text }}</span>
        </li>
        <li v-if="notes.hidden > 0" class="notice-more">
          {{ tn(notes.hidden, "and {count} more change", "and {count} more changes") }}
        </li>
      </ul>

      <footer class="notice-actions">
        <button class="btn-later" data-testid="update-notice-later" @click="updates.dismiss()">
          {{ t("Later") }}
        </button>
        <button class="btn-install" data-testid="update-notice-install" @click="updates.install()">
          {{ t("Install and Restart") }}
        </button>
      </footer>
    </aside>
  </Transition>
</template>

<style scoped>
.update-notice {
  position: fixed;
  right: 16px;
  bottom: 44px;
  z-index: 9000;
  width: 360px;
  max-width: calc(100vw - 32px);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-mdl);
  color: var(--color-text);
  overflow: hidden;
}

.notice-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 12px 12px 16px;
}

.notice-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.notice-heading {
  flex: 1;
  min-width: 0;
}

.notice-title {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.notice-versions {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-text-secondary);
}

.notice-muted {
  color: var(--color-text-muted);
}

.notice-close {
  padding: 0 4px;
  font-size: 20px;
  line-height: 1;
  color: var(--color-text-muted);
}

.notice-close:hover {
  color: var(--color-text);
}

.notice-notes {
  list-style: none;
  margin: 0 16px;
  padding: 8px 0;
  border-top: 1px solid var(--color-divider);
  max-height: 180px;
  overflow-y: auto;
}

.notice-note {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  line-height: 1.5;
}

.notice-more {
  padding: 4px 0;
  font-size: 12px;
  color: var(--color-text-muted);
}

.kind {
  flex: 0 0 64px;
  text-align: center;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
}

.kind-new {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.kind-improved {
  background: color-mix(in srgb, var(--color-warning) 16%, transparent);
  color: var(--color-warning-text);
}

.kind-fixed {
  background: color-mix(in srgb, var(--color-success) 16%, transparent);
  color: var(--color-success);
}

.notice-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-divider);
}

.btn-later,
.btn-install {
  height: 32px;
  padding: 0 16px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 500;
}

.btn-later {
  color: var(--color-text-secondary);
}

.btn-later:hover {
  background: var(--color-bg-hover);
  color: var(--color-text);
}

.btn-install {
  background: var(--color-accent);
  color: white;
}

.btn-install:hover {
  background: var(--color-accent-hover);
}

.btn-later:focus-visible,
.btn-install:focus-visible,
.notice-close:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 2px;
}

.update-notice-enter-active,
.update-notice-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.update-notice-enter-from,
.update-notice-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
