<script setup lang="ts">
// Help > About. Everything here describes the running build, so it changes
// with every update: the version stamped by the release workflow, the
// build date and commit, and that build's release notes (falling back to
// the curated changelog for local builds).
import { computed, onMounted, onUnmounted } from "vue";
import { openUrl } from "@tauri-apps/plugin-opener";
import { t, dateLocale } from "@/i18n";
import logoUrl from "@/assets/goyav-logo.png";
import { buildReleaseNotes } from "@/lib/release-notes";
import { CHANGELOG, changeText, compareVersions, type ChangeKind } from "@/lib/changelog";
import { useUpdatesStore } from "@/stores/updates";

const props = withDefaults(defineProps<{ open: boolean; showWhatsNewLink?: boolean }>(), {
  showWhatsNewLink: false,
});
const emit = defineEmits<{ close: []; "whats-new": [] }>();

const REPO_URL = "https://github.com/AndyD9/Goyav";
const LICENSE_URL = `${REPO_URL}/blob/goyav/LICENSE`;
const MAX_NOTES = 6;

const KIND_LABELS: Record<ChangeKind, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

const updates = useUpdatesStore();

const version = __APP_VERSION__;
const commit = __APP_COMMIT__;
const shortCommit = commit.slice(0, 7);

const buildDate = computed(() => {
  const date = new Date(__APP_BUILD_DATE__);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(dateLocale(), { day: "numeric", month: "long", year: "numeric" });
});

/** What changed in this build: generated notes, else the curated entry for this series. */
const notes = computed(() => {
  const generated = buildReleaseNotes().flatMap((section) =>
    section.items.map((text) => ({ kind: section.kind, text })),
  );
  if (generated.length > 0) return generated;
  const curated = CHANGELOG.find((release) => compareVersions(release.version, version) <= 0);
  return curated?.changes.map((change) => ({ kind: change.kind, text: changeText(change) })) ?? [];
});

const shownNotes = computed(() => notes.value.slice(0, MAX_NOTES));
const hiddenNotes = computed(() => Math.max(0, notes.value.length - MAX_NOTES));

const updateStatus = computed(() => {
  if (updates.available) {
    return { tone: "available", text: t("Version {version} available", { version: updates.available.version }) };
  }
  if (updates.lastCheck === "upToDate") return { tone: "ok", text: t("Up to date") };
  return null;
});

const checking = computed(() => updates.phase === "checking");

async function openExternal(url: string) {
  try {
    await openUrl(url);
  } catch (error) {
    console.error("Failed to open URL:", url, error);
  }
}

function install() {
  emit("close");
  void updates.install();
}

function onKeyDown(event: KeyboardEvent) {
  if (!props.open || event.key !== "Escape") return;
  // Prevent an ancestor's Escape shortcut after dismissing this modal.
  event.stopImmediatePropagation();
  event.preventDefault();
  emit("close");
}

onMounted(() => window.addEventListener("keydown", onKeyDown));
onUnmounted(() => window.removeEventListener("keydown", onKeyDown));
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="about-overlay"
      data-testid="about-overlay"
      @click.self="emit('close')"
    >
      <div class="about-modal" role="dialog" aria-modal="true" aria-labelledby="about-title">
        <header class="about-header">
          <img :src="logoUrl" alt="" class="about-logo" />
          <div class="about-heading">
            <h2 id="about-title" class="about-title">Goyav</h2>
            <p class="about-tagline">{{ t("A personal mail and calendar client.") }}</p>
          </div>
          <button
            class="about-close"
            data-testid="about-close"
            :aria-label="t('Close')"
            @click="emit('close')"
          >&times;</button>
        </header>

        <div class="about-body">
          <dl class="about-meta">
            <dt>{{ t("Version") }}</dt>
            <dd class="about-version-row">
              <span data-testid="about-version">{{ version }}</span>
              <span
                v-if="updateStatus"
                class="about-status"
                :class="`about-status-${updateStatus.tone}`"
                data-testid="about-update-status"
              >{{ updateStatus.text }}</span>
            </dd>
            <template v-if="buildDate">
              <dt>{{ t("Built") }}</dt>
              <dd data-testid="about-build-date">{{ buildDate }}</dd>
            </template>
            <template v-if="shortCommit">
              <dt>{{ t("Commit") }}</dt>
              <dd>
                <a
                  href="#"
                  class="about-mono"
                  data-testid="about-commit-link"
                  @click.prevent="openExternal(`${REPO_URL}/commit/${commit}`)"
                >{{ shortCommit }}</a>
              </dd>
            </template>
            <dt>{{ t("Source") }}</dt>
            <dd>
              <a
                href="#"
                data-testid="about-source-link"
                @click.prevent="openExternal(REPO_URL)"
              >github.com/AndyD9/Goyav</a>
            </dd>
            <dt>{{ t("License") }}</dt>
            <dd>
              <a
                href="#"
                data-testid="about-license-link"
                @click.prevent="openExternal(LICENSE_URL)"
              >GPL-3.0</a>
            </dd>
          </dl>

          <section v-if="shownNotes.length > 0" class="about-notes" data-testid="about-notes">
            <h3 class="about-notes-title">{{ t("In this version") }}</h3>
            <ul>
              <li v-for="(note, i) in shownNotes" :key="i" class="about-note">
                <span class="kind" :class="`kind-${note.kind}`">{{ t(KIND_LABELS[note.kind]) }}</span>
                <span>{{ note.text }}</span>
              </li>
            </ul>
            <p v-if="hiddenNotes > 0" class="about-more">
              {{ t("and {count} more…", { count: hiddenNotes }) }}
            </p>
          </section>
        </div>

        <footer class="about-footer">
          <button
            v-if="showWhatsNewLink"
            class="about-link-btn"
            data-testid="about-whats-new"
            @click="emit('whats-new')"
          >{{ t("All changes") }}</button>
          <span class="about-footer-spacer" />
          <button
            v-if="updates.available"
            class="about-primary"
            data-testid="about-install-update"
            @click="install"
          >{{ t("Install and Restart") }}</button>
          <button
            v-else
            class="about-secondary"
            data-testid="about-check-updates"
            :disabled="checking"
            :aria-busy="checking"
            @click="updates.check()"
          >{{ checking ? t("Checking…") : t("Check for Updates") }}</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.about-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.about-modal {
  display: flex;
  flex-direction: column;
  width: 440px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 64px);
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  box-shadow: var(--shadow-mdl);
  color: var(--color-text);
  overflow: hidden;
}

.about-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 20px 16px 16px 20px;
}

.about-logo {
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.about-heading {
  flex: 1;
  min-width: 0;
}

.about-title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.about-tagline {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.about-close {
  align-self: flex-start;
  color: var(--color-text-muted);
  font-size: 22px;
  line-height: 1;
  padding: 0 8px;
}

.about-close:hover {
  color: var(--color-text);
}

.about-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 20px 20px;
}

.about-meta {
  display: grid;
  grid-template-columns: 84px 1fr;
  row-gap: 8px;
  column-gap: 12px;
  margin: 0;
  padding: 16px 0 0;
  border-top: 1px solid var(--color-divider);
  font-size: 13px;
}

.about-meta dt {
  color: var(--color-text-muted);
  font-weight: 500;
}

.about-meta dd {
  margin: 0;
}

.about-version-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-weight: 600;
}

.about-status {
  padding: 1px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
}

.about-status-ok {
  background: color-mix(in srgb, var(--color-success) 16%, transparent);
  color: var(--color-success);
}

.about-status-available {
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.about-mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.about-meta a {
  color: var(--color-accent);
  text-decoration: none;
  cursor: pointer;
}

.about-meta a:hover {
  text-decoration: underline;
}

.about-notes {
  margin-top: 20px;
  padding-top: 16px;
  border-top: 1px solid var(--color-divider);
}

.about-notes-title {
  margin: 0 0 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--color-text-muted);
}

.about-notes ul {
  list-style: none;
  margin: 0;
  padding: 0;
}

.about-note {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 4px 0;
  font-size: 12px;
  line-height: 1.5;
}

.about-more {
  margin: 4px 0 0;
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

.about-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 20px;
  background: var(--color-bg-secondary);
  border-top: 1px solid var(--color-divider);
}

.about-footer-spacer {
  flex: 1;
}

.about-link-btn {
  font-size: 13px;
  color: var(--color-accent);
}

.about-link-btn:hover {
  text-decoration: underline;
}

.about-primary,
.about-secondary {
  height: 32px;
  padding: 0 16px;
  border-radius: var(--radius);
  font-size: 13px;
  font-weight: 500;
}

.about-primary {
  background: var(--color-accent);
  color: white;
}

.about-primary:hover {
  background: var(--color-accent-hover);
}

.about-secondary {
  border: 1px solid var(--color-border);
  color: var(--color-text);
}

.about-secondary:hover:not(:disabled) {
  background: var(--color-bg-hover);
}

.about-secondary:disabled {
  color: var(--color-text-muted);
}
</style>
