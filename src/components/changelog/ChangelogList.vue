<script setup lang="ts">
// Renders changelog releases: version, date, and tagged changes.
import { CHANGELOG, changeText, type ChangeKind, type ChangelogRelease } from "@/lib/changelog";
import { t, dateLocale } from "@/i18n";

const props = withDefaults(
  defineProps<{ releases?: readonly ChangelogRelease[]; current?: string }>(),
  { releases: () => CHANGELOG, current: undefined },
);

const KIND_LABELS: Record<ChangeKind, string> = {
  new: "New",
  improved: "Improved",
  fixed: "Fixed",
};

function formatDate(iso: string): string {
  const date = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(dateLocale(), { day: "numeric", month: "long", year: "numeric" });
}
</script>

<template>
  <div class="changelog" data-testid="changelog">
    <section
      v-for="release in props.releases"
      :key="release.version"
      class="release"
      :data-testid="`changelog-${release.version}`"
    >
      <header class="release-head">
        <h3 class="release-version">{{ t("Version {version}", { version: release.version }) }}</h3>
        <span v-if="release.version === props.current" class="release-current">{{ t("Installed") }}</span>
        <time class="release-date" :datetime="release.date">{{ formatDate(release.date) }}</time>
      </header>
      <ul class="changes">
        <li v-for="(change, i) in release.changes" :key="i" class="change">
          <span class="kind" :class="`kind-${change.kind}`">{{ t(KIND_LABELS[change.kind]) }}</span>
          <span class="change-text">{{ changeText(change) }}</span>
        </li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.changelog {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.release {
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel, 12px);
  overflow: hidden;
}

.release-head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  background: var(--color-bg-secondary);
  border-bottom: 1px solid var(--color-divider);
}

.release-version {
  font-size: 14px;
  font-weight: 600;
}

.release-current {
  padding: 1px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  background: var(--color-accent-light);
  color: var(--color-accent);
}

.release-date {
  margin-left: auto;
  font-size: 12px;
  color: var(--color-text-muted);
}

.changes {
  list-style: none;
  margin: 0;
  padding: 8px 0;
}

.change {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 16px;
  font-size: 13px;
  line-height: 1.5;
}

.kind {
  flex: 0 0 76px;
  text-align: center;
  padding: 1px 0;
  border-radius: 8px;
  font-size: 11px;
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

.change-text {
  color: var(--color-text);
}
</style>
