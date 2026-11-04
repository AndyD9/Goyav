<script setup lang="ts">
import { computed } from "vue";
import type { ThreadSummary } from "@/lib/types";
import { useUiStore } from "@/stores/ui";
import { acctColor } from "@/lib/account-colors";
import { t, dateLocale } from "@/i18n";

const props = defineProps<{
  thread: ThreadSummary;
  expanded: boolean;
  active: boolean;
  selected: boolean;
}>();

defineEmits<{
  toggle: [];
  open: [];
  toggleSelect: [];
  toggleStar: [];
}>();

const uiStore = useUiStore();

const senderColor = computed(() => acctColor(props.thread.from_email));

function senderInitial(): string {
  const src = (props.thread.from_name ?? props.thread.from_email ?? "?").trim();
  return src.charAt(0).toUpperCase() || "?";
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  if (isToday) {
    return date.toLocaleTimeString(dateLocale(), { hour: "2-digit", minute: "2-digit", hour12: uiStore.hour12 });
  }
  const isThisYear = date.getFullYear() === now.getFullYear();
  if (isThisYear) {
    return date.toLocaleDateString(dateLocale(), { month: "short", day: "numeric" });
  }
  return date.toLocaleDateString(dateLocale(), {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function hasUnread(): boolean {
  return props.thread.unread_count > 0;
}

function isStarred(): boolean {
  return props.thread.flags.includes("flagged");
}

function isReply(): boolean {
  if (props.thread.flags.includes("answered")) return true;
  if (!props.thread.subject) return false;
  const lower = props.thread.subject.trimStart().toLowerCase();
  return lower.startsWith("re:") || lower.startsWith("fwd:") || lower.startsWith("fw:");
}
</script>

<template>
  <!-- Cards layout: avatar + sender / subject / preview. The message
       count badge doubles as the expand toggle. -->
  <div
    v-if="uiStore.messageListLayout === 'cards'"
    class="mail-card"
    :class="{ active, selected, unread: hasUnread() }"
    @dblclick="$emit('open')"
  >
    <div class="mail-card-lead" data-testid="thread-check-cell" @click.stop="$emit('toggleSelect')">
      <span
        class="mail-card-avatar"
        :style="{ background: senderColor.soft, color: senderColor.fill }"
      >{{ senderInitial() }}</span>
      <input
        type="checkbox"
        class="mail-card-check"
        :checked="selected"
        @click.stop="$emit('toggleSelect')"
      />
    </div>
    <div class="mail-card-body">
      <div class="mail-card-line">
        <span v-if="hasUnread()" class="mail-card-unread" data-testid="msg-unread-dot" />
        <span class="mail-card-from" data-testid="msg-from">
          {{ thread.from_name || thread.from_email }}
        </span>
        <button
          v-if="thread.message_count > 1"
          type="button"
          class="mail-card-count"
          :class="{ expanded }"
          :aria-label="expanded ? t('Collapse thread of {count} messages', { count: thread.message_count }) : t('Expand thread of {count} messages', { count: thread.message_count })"
          :aria-expanded="expanded"
          @click.stop="$emit('toggle')"
        >{{ thread.message_count }}</button>
        <span class="mail-card-date" data-testid="msg-date">{{ formatDate(thread.last_date) }}</span>
      </div>
      <div class="mail-card-line col-subject" :class="{ bold: hasUnread() && !expanded }">
        <span v-if="isReply()" class="mail-card-reply">&hookleftarrow;</span>
        <span class="mail-card-subject" data-testid="msg-subject">{{ thread.subject || t("(no subject)") }}</span>
        <svg
          v-if="thread.has_attachments"
          class="mail-card-clip"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
          :aria-label="t('Has attachments')"
        >
          <path d="M21.44 11.05l-9.19 9.19a6 6 0 1 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
        <span
          class="mail-card-star"
          :class="{ starred: isStarred() }"
          data-testid="msg-star"
          :data-starred="isStarred()"
          @click.stop="$emit('toggleStar')"
        >{{ isStarred() ? '\u2605' : '\u2606' }}</span>
      </div>
      <div v-if="thread.snippet" class="mail-card-snippet">{{ thread.snippet }}</div>
    </div>
  </div>

  <div
    v-else
    class="thread-row"
    :class="{ active, selected, unread: hasUnread() }"
    @dblclick="$emit('open')"
  >
    <div
      class="col col-check"
      data-testid="thread-check-cell"
      @click.stop="$emit('toggleSelect')"
    >
      <input
        type="checkbox"
        class="row-checkbox"
        :checked="selected"
        @click.stop="$emit('toggleSelect')"
      />
    </div>
    <div class="col col-icons">
      <span
        class="expand-icon"
        @click.stop="$emit('toggle')"
      >{{ thread.message_count > 1 ? (expanded ? '\u25BF' : '\u25B9') : '\u00A0' }}</span>
      <span
        class="icon-read"
        :class="{ unread: hasUnread() }"
        data-testid="msg-unread-dot"
      >&#x25CF;</span>
      <span
        class="icon-star"
        :class="{ starred: isStarred() }"
        data-testid="msg-star"
        :data-starred="isStarred()"
        @click.stop="$emit('toggleStar')"
      >{{ isStarred() ? '\u2605' : '\u2606' }}</span>
    </div>
    <div class="col col-subject" :class="{ bold: hasUnread() && !expanded }">
      <span v-if="isReply()" class="reply-icon">&hookleftarrow;</span>
      <span class="subject-text" data-testid="msg-subject">{{ thread.subject || t("(no subject)") }}</span>
      <span v-if="thread.message_count > 1" class="thread-count">({{ thread.message_count }})</span>
    </div>
    <div class="col col-from" :class="{ bold: hasUnread() && !expanded }" data-testid="msg-from">
      {{ thread.from_name || thread.from_email }}
    </div>
    <div class="col col-date" data-testid="msg-date">
      {{ formatDate(thread.last_date) }}
    </div>
  </div>
</template>

<style scoped>
.thread-row {
  display: flex;
  align-items: center;
  width: 100%;
  height: 28px;
  text-align: left;
  border-bottom: 1px solid var(--color-border);
  font-size: 12px;
  transition: background 0.1s;
  cursor: default;
  user-select: none;
}

.thread-row:hover {
  background: var(--color-bg-hover);
}

.thread-row.active {
  background: var(--color-bg-active);
}

.thread-row.selected {
  background: var(--color-bg-active);
  box-shadow: inset 3px 0 0 var(--color-accent);
}

.thread-row.selected:hover {
  background: var(--color-bg-active);
}

.thread-row.unread .col-subject,
.thread-row.unread .col-from {
  font-weight: 700;
  color: var(--color-text);
}

.col {
  padding: 0 6px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-check {
  width: 28px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  cursor: pointer;
  align-self: stretch;
}

.row-checkbox {
  width: 13px;
  height: 13px;
  cursor: pointer;
  accent-color: var(--color-accent);
}

.col-icons {
  display: flex;
  align-items: center;
  gap: 2px;
  width: 46px;
  flex-shrink: 0;
  padding: 0 2px;
}

.icon-read {
  font-size: 8px;
  color: var(--color-accent);
  visibility: hidden;
}

.icon-read.unread {
  visibility: visible;
}

.expand-icon {
  font-size: 11px;
  color: var(--color-text-muted);
  cursor: pointer;
  width: 14px;
  text-align: center;
}

.expand-icon:hover {
  color: var(--color-accent);
}

.icon-star {
  font-size: 13px;
  color: var(--color-text-muted);
  cursor: pointer;
}

.icon-star.starred {
  color: var(--color-star-flag);
}

.col-subject {
  flex: 2;
  min-width: 0;
  color: var(--color-text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.reply-icon {
  color: var(--color-accent);
  font-size: 13px;
  flex-shrink: 0;
}

.subject-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.thread-count {
  font-size: 10px;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.col-from {
  flex: 2;
  min-width: 0;
  color: var(--color-text-secondary);
}

.col-date {
  width: 110px;
  flex-shrink: 0;
  color: var(--color-text-muted);
  font-size: 11px;
}

.bold {
  font-weight: 600;
  color: var(--color-text);
}
</style>
